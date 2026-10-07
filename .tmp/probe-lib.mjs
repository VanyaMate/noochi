// Shared helpers for the live probes (local dev stack, demo account).
export const BASE = 'http://localhost:3000';

async function rpc(path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}

export async function login() {
  const r = await rpc('/api/auth/login', { email: 'demo@noochi.app', password: 'noochi-demo-42' });
  return r.tokens.accessToken;
}

export const send = (conversationId, text, token) =>
  rpc('/api/chat/send', { conversationId, text, requestId: crypto.randomUUID() }, token);

export async function history(conversationId, token) {
  const r = await rpc('/api/chat/history', { conversationId }, token);
  return r.messages;
}
