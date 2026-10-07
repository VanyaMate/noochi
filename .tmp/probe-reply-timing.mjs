// Timing probe for п.4: when does prose start reaching the client, and what does the machine
// check block add on top of the visible answer?
import { createRequire } from 'node:module';
const require = createRequire('C:/dev/projects/learn-language-chat/apps/gateway/noop.js');
const WebSocket = require('ws');

const BASE = 'http://localhost:3000';
const CONV = process.argv[2];
const TEXT = process.argv[3] ?? 'what did you eat today?';

const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'demo@noochi.app', password: 'noochi-demo-42' }),
}).then((r) => r.json());
const token = login?.tokens?.accessToken;
if (!token) { console.log('login failed', JSON.stringify(login).slice(0, 200)); process.exit(1); }

const t0 = Date.now();
const rel = () => Date.now() - t0;
const marks = [];
let deltas = 0, proseChars = 0, streamDoneMs = 0, firstDeltaMs = 0;
const deltaTimes = [];

const ws = new WebSocket(`ws://localhost:3000/ws?token=${token}`);
ws.on('open', () => ws.send(JSON.stringify({ action: 'sub', conversationId: CONV })));
ws.on('message', (raw) => {
  let env; try { env = JSON.parse(raw.toString()); } catch { return; }
  const ev = env.payload ?? env;
  const type = ev.type ?? env.kind ?? '?';
  if (type === 'stream_delta') {
    const len = (ev.delta ?? '').length;
    deltas++; proseChars += len;
    deltaTimes.push({ ms: rel(), chars: len });
    if (len > 0 && firstDeltaMs === 0) firstDeltaMs = rel();
    if (ev.done) streamDoneMs = rel();
    return;
  }
  if (type === 'hello') return;
  marks.push({
    step: type,
    ms: rel(),
    note: type === 'message' ? `${(ev.message?.text ?? '').length} chars, sender=${ev.message?.sender}, check=${ev.message?.check?.status ?? '-'}` : '',
  });
});

await new Promise((r) => setTimeout(r, 500));
const restStart = rel();
const res = await fetch(`${BASE}/api/chat/send`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({ conversationId: CONV, text: TEXT, requestId: crypto.randomUUID() }),
});
const body = await res.json();
const restMs = rel();
await new Promise((r) => setTimeout(r, 1500));
ws.close();

console.log(JSON.stringify({
  status: res.status,
  sendRestCall: { startedMs: restStart, returnedMs: restMs, durationMs: restMs - restStart },
  streamDeltas: deltas,
  proseCharsStreamed: proseChars,
  firstProseDeltaMs: firstDeltaMs,
  deltaTimes,
  streamDoneMs,
  checkInRestResponse: body?.userMessage?.check ? body.userMessage.check.status : null,
  steps: marks,
}, null, 2));
process.exit(0);
