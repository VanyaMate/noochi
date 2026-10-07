import Fastify from 'fastify';
import cors from '@fastify/cors';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  AppError, RemoteAppError, HTTP_STATUS, REQ_VALIDATORS, PLANS,
  type ErrorCode, type SubjectName,
} from '@noochi/shared';
import { verifyAccessToken, type Stack } from '@noochi/platform';

interface Auth { userId: string; role: string }

const SEND_TIMEOUT = 100_000; // chat.send includes AI generation
const EXPLAIN_TIMEOUT = 60_000;

export async function createGateway(stack: Stack) {
  const app = Fastify({ logger: false, bodyLimit: 2_000_000 });
  await app.register(cors, { origin: true });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof RemoteAppError || err instanceof AppError) {
      return reply.status(HTTP_STATUS[err.code] ?? 500).send({ error: { code: err.code, message: err.message, details: err.details ?? null } });
    }
    const msg = err instanceof Error ? err.message : 'gateway error';
    if (stack.env.mode === 'standalone') console.error('[noochi:gateway]', err);
    return reply.status(500).send({ error: { code: 'INTERNAL' as ErrorCode, message: msg } });
  });

  async function requireAuth(req: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply, admin = false): Promise<Auth | null> {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) { reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'No token' } }); return null; }
    try {
      const auth = await verifyAccessToken(stack.env.jwtSecret, token);
      if (admin && auth.role !== 'admin') { reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Admin only' } }); return null; }
      return auth;
    } catch {
      reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Bad or expired token' } });
      return null;
    }
  }

  // simple per-IP rate limit
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return;
    const ip = req.ip || 'unknown';
    const used = await stack.cache.incr(`rl:${ip}`, 60);
    if (used > 600) {
      reply.status(429).send({ error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down a bit' } });
    }
  });

  function rpc(path: string, subject: SubjectName, opts: { auth?: 'none' | 'user' | 'admin'; timeout?: number; targetUser?: boolean } = {}) {
    app.post(path, async (req, reply) => {
      let auth: Auth | null = null;
      if (opts.auth !== 'none') {
        auth = await requireAuth(req, reply, opts.auth === 'admin');
        if (!auth) return reply;
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const payload: Record<string, unknown> = { ...body };
      // admin routes that act on another account must keep the target userId from the body
      if (opts.targetUser) {
        if (typeof payload.userId !== 'string' || !payload.userId) {
          return reply.status(400).send({ error: { code: 'BAD_REQUEST', message: 'userId: Required' } });
        }
      } else if (auth) {
        payload.userId = auth.userId; // server-side identity wins
      }
      const validator = REQ_VALIDATORS[subject];
      let valid = payload as object;
      if (validator) {
        const parsed = validator.safeParse(payload);
        if (!parsed.success) {
          return reply.status(400).send({ error: { code: 'BAD_REQUEST', message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') } });
        }
        valid = parsed.data as object;
      }
      return await stack.bus.request(subject as SubjectName, valid as never, opts.timeout ?? 30_000);
    });
  }

  // ---- routes ----
  app.get('/healthz', async () => ({ ok: true, mode: stack.env.mode }));
  app.get('/api/billing/plans', async () => Object.values(PLANS));

  rpc('/api/auth/register', 'svc.auth.register', { auth: 'none' });
  rpc('/api/auth/login', 'svc.auth.login', { auth: 'none' });
  rpc('/api/auth/refresh', 'svc.auth.refresh', { auth: 'none' });
  rpc('/api/auth/me', 'svc.auth.me');

  rpc('/api/users/get', 'svc.users.get');
  rpc('/api/users/update', 'svc.users.update');
  rpc('/api/users/set-ai', 'svc.users.set_ai');

  rpc('/api/bots/catalog', 'svc.bots.catalog');
  rpc('/api/bots/get', 'svc.bots.get');
  rpc('/api/bots/create', 'svc.bots.create');
  rpc('/api/bots/update', 'svc.bots.update');
  rpc('/api/bots/remove', 'svc.bots.remove');

  rpc('/api/chat/conversations', 'svc.chat.conversations');
  rpc('/api/chat/open', 'svc.chat.open');
  rpc('/api/chat/history', 'svc.chat.history');
  rpc('/api/chat/send', 'svc.chat.send', { timeout: SEND_TIMEOUT });
  rpc('/api/chat/remove', 'svc.chat.remove');

  rpc('/api/ai/explain', 'svc.ai.explain', { timeout: EXPLAIN_TIMEOUT });
  rpc('/api/ai/check', 'svc.ai.check', { timeout: EXPLAIN_TIMEOUT });
  rpc('/api/ai/translate', 'svc.ai.translate', { timeout: EXPLAIN_TIMEOUT });
  rpc('/api/ai/explains', 'svc.ai.explain_list');
  rpc('/api/ai/explain/remove', 'svc.ai.explain_remove');

  rpc('/api/study/add', 'svc.study.add');
  rpc('/api/study/list', 'svc.study.list');
  rpc('/api/study/remove', 'svc.study.remove');
  rpc('/api/study/review', 'svc.study.review');

  rpc('/api/billing/status', 'svc.billing.status');
  rpc('/api/billing/subscribe', 'svc.billing.subscribe');

  rpc('/api/analytics/summary', 'svc.analytics.summary');

  rpc('/api/admin/users/list', 'svc.users.admin_list', { auth: 'admin' });
  rpc('/api/admin/users/update', 'svc.users.admin_update', { auth: 'admin', targetUser: true });
  rpc('/api/admin/overview', 'svc.analytics.admin_overview', { auth: 'admin' });

  // ---- websocket fanout ----
  const wss = new WebSocketServer({ noServer: true });
  const rooms = new Map<string, Set<WebSocket>>();
  const usersOnline = new Map<string, Set<WebSocket>>();

  await app.ready();
  app.server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '', 'http://localhost');
    if (url.pathname !== '/ws') return;
    const token = url.searchParams.get('token') ?? '';
    verifyAccessToken(stack.env.jwtSecret, token).then((auth) => {
      wss.handleUpgrade(req, socket, head, (ws) => {
        (ws as WebSocket & { auth?: Auth }).auth = auth;
        wss.emit('connection', ws, req);
      });
    }).catch(() => { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); });
  });

  wss.on('connection', (ws: WebSocket & { auth?: Auth }) => {
    const uid = ws.auth?.userId;
    if (uid) {
      if (!usersOnline.has(uid)) usersOnline.set(uid, new Set());
      usersOnline.get(uid)!.add(ws);
    }
    ws.send(JSON.stringify({ kind: 'hello' }));
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as { action: string; conversationId?: string };
        if (msg.action === 'sub' && msg.conversationId && uid) {
          if (!rooms.has(msg.conversationId)) rooms.set(msg.conversationId, new Set());
          rooms.get(msg.conversationId)!.add(ws);
        }
        if (msg.action === 'unsub' && msg.conversationId) rooms.get(msg.conversationId)?.delete(ws);
      } catch { /* ignore malformed */ }
    });
    ws.on('close', () => {
      if (uid) {
        const set = usersOnline.get(uid);
        set?.delete(ws);
        if (set && set.size === 0) usersOnline.delete(uid);
      }
      for (const [cid, set] of rooms) {
        set.delete(ws);
        if (set.size === 0) rooms.delete(cid);
      }
    });
    ws.on('error', () => ws.terminate());
  });

  await stack.bus.subscribeEvents('evt.>', (payload, subject) => {
    const text = JSON.stringify({ kind: 'event', subject, payload });
    const parts = subject.split('.');
    if (parts[1] === 'chat' && parts[2]) {
      for (const ws of rooms.get(parts[2]) ?? []) if (ws.readyState === ws.OPEN) ws.send(text);
    }
    if (parts[1] === 'user' && parts[2]) {
      for (const ws of usersOnline.get(parts[2]) ?? []) if (ws.readyState === ws.OPEN) ws.send(text);
      // admins get billing/user events too
      if (parts[3] === 'notify') return;
    }
  });

  async function listen(port: number) {
    await app.listen({ port, host: '0.0.0.0' });
    console.log(`[noochi:gateway] http+ws on :${port} (${stack.env.mode})`);
  }
  async function close() {
    wss.close();
    await app.close();
  }

  return { app, listen, close, wss };
}
