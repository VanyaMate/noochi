import { connect, StringCodec, type NatsConnection, type Subscription, type JetStreamManager, type JetStreamClient } from 'nats';
import {
  AppError, RemoteAppError, ERROR_CODES, type ErrorCode,
  type SubjectName, type ReqOf, type ResOf,
} from '@noochi/shared';

const sc = StringCodec();

export interface HandlerCtx {
  subject: string;
}
export type Handler = (req: any, ctx: HandlerCtx) => Promise<any>;
export type EventCb = (payload: unknown, subject: string) => void | Promise<void>;

export interface Bus {
  connect(): Promise<void>;
  request<K extends SubjectName>(subject: K, payload: ReqOf<K>, timeoutMs?: number): Promise<ResOf<K>>;
  registerHandler(subject: SubjectName, handler: Handler, queueGroup?: string): void;
  publish(subject: string, payload: unknown): void;
  subscribeEvents(pattern: string, cb: EventCb): Promise<void>;
  /** Durable at-least-once publish into JetStream (audit/replay). */
  publishDurable(subject: string, payload: unknown): Promise<void>;
  close(): Promise<void>;
}

const ERR_MARK = '__noochi_err';

function serializeError(e: unknown): Uint8Array {
  // preserve typed codes across multi-hop chains (AppError *and* RemoteAppError re-serialized)
  const code = (e as { code?: unknown })?.code;
  const known = typeof code === 'string' && (ERROR_CODES as readonly string[]).includes(code);
  const err = e instanceof AppError || e instanceof RemoteAppError
    ? e
    : new AppError(known ? code as ErrorCode : 'INTERNAL', e instanceof Error ? e.message : 'internal error', known ? (e as { details?: unknown }).details : undefined);
  return sc.encode(JSON.stringify({ [ERR_MARK]: { code: err.code, message: err.message, details: err.details ?? null } }));
}

function tryThrowRemote(text: string): void {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && ERR_MARK in parsed) {
      const { code, message, details } = parsed[ERR_MARK];
      throw new RemoteAppError((ERROR_CODES as readonly string[]).includes(code) ? code as ErrorCode : 'INTERNAL', message ?? 'error', details);
    }
  } catch (e) {
    if (e instanceof RemoteAppError) throw e;
    throw new RemoteAppError('INTERNAL', 'malformed reply');
  }
}

/** NATS JetStream-backed bus (infra mode). */
export class NatsBus implements Bus {
  private nc!: NatsConnection;
  private js?: JetStreamClient;
  private jsms?: JetStreamManager;
  private subs: Subscription[] = [];

  constructor(private url: string, private streamPrefix = 'NOOCHI') {}

  async connect(): Promise<void> {
    this.nc = await connect({ servers: this.url, maxReconnectAttempts: 60, reconnectTimeWait: 1000 });
    try {
      this.jsms = await this.nc.jetstreamManager();
      this.js = this.nc.jetstream();
      await this.ensureStream();
    } catch {
      // JetStream unavailable → fall back to core-only for live traffic
      this.js = undefined;
      this.jsms = undefined;
    }
  }

  private async ensureStream(): Promise<void> {
    if (!this.jsms) return;
    const name = this.streamPrefix;
    try {
      await this.jsms.streams.info(name);
    } catch {
      await this.jsms.streams.add({
        name,
        subjects: ['evt.>'],
        max_msgs: 200_000,
        max_age: 1000 * 60 * 60 * 24 * 14,
      });
    }
  }

  async request<K extends SubjectName>(subject: K, payload: ReqOf<K>, timeoutMs = 30_000): Promise<ResOf<K>> {
    const res = await this.nc.request(subject, sc.encode(JSON.stringify(payload)), { timeout: timeoutMs })
      .catch((e: unknown) => {
        if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'NoRespondersError')) {
          throw new AppError('INTERNAL', `no responder for ${subject}`);
        }
        throw e;
      });
    const text = sc.decode(res.data);
    tryThrowRemote(text);
    return JSON.parse(text) as ResOf<K>;
  }

  registerHandler(subject: SubjectName, handler: Handler, queueGroup?: string): void {
    const sub = this.nc.subscribe(subject, { queue: queueGroup });
    this.subs.push(sub);
    (async () => {
      for await (const msg of sub) {
        try {
          const req = JSON.parse(sc.decode(msg.data));
          const out = await handler(req, { subject });
          msg.respond(sc.encode(JSON.stringify(out ?? null)));
        } catch (e) {
          msg.respond(serializeError(e));
        }
      }
    })();
  }

  publish(subject: string, payload: unknown): void {
    this.nc.publish(subject, sc.encode(JSON.stringify(payload)));
  }

  async publishDurable(subject: string, payload: unknown): Promise<void> {
    if (!this.js) return this.publish(subject, payload);
    try { await this.js.publish(subject, sc.encode(JSON.stringify(payload))); }
    catch { this.publish(subject, payload); }
  }

  async subscribeEvents(pattern: string, cb: EventCb): Promise<void> {
    const sub = this.nc.subscribe(pattern);
    this.subs.push(sub);
    (async () => {
      for await (const msg of sub) {
        try { cb(JSON.parse(sc.decode(msg.data)), msg.subject); } catch { /* listener error */ }
      }
    })();
  }

  async close(): Promise<void> {
    for (const s of this.subs) s.unsubscribe();
    await this.nc.drain();
    await this.nc.close();
  }
}

/** Simple wildcard matcher: tokens, '*' one, '>' rest. */
export function matchSubject(pattern: string, subject: string): boolean {
  const p = pattern.split('.');
  const s = subject.split('.');
  for (let i = 0; i < p.length; i++) {
    if (p[i] === '>') return true;
    if (i >= s.length) return false;
    if (p[i] !== '*' && p[i] !== s[i]) return false;
  }
  return p.length === s.length;
}

/** In-process bus (standalone mode): same semantics, no network. */
export class LocalBus implements Bus {
  private handlers = new Map<string, Handler>();
  private listeners: { pattern: string; cb: EventCb }[] = [];

  async connect(): Promise<void> { /* noop */ }
  async request<K extends SubjectName>(subject: K, payload: ReqOf<K>): Promise<ResOf<K>> {
    const h = this.handlers.get(subject);
    if (!h) throw new RemoteAppError('INTERNAL', `no local handler for ${subject}`);
    return await h(payload, { subject }) as ResOf<K>;
  }
  registerHandler(subject: SubjectName, handler: Handler): void {
    this.handlers.set(subject, handler);
  }
  publish(subject: string, payload: unknown): void {
    for (const { pattern, cb } of this.listeners) {
      if (matchSubject(pattern, subject)) void cb(payload, subject);
    }
  }
  async publishDurable(subject: string, payload: unknown): Promise<void> {
    this.publish(subject, payload);
  }
  async subscribeEvents(pattern: string, cb: EventCb): Promise<void> {
    this.listeners.push({ pattern, cb });
  }
  async close(): Promise<void> {
    this.handlers.clear();
    this.listeners = [];
  }
}
