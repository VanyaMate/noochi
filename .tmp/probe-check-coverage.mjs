// How often does the reply actually carry a proofread? Walks chat history through the public API.
import { login } from './probe-lib.mjs';

const token = await login();
const H = { 'content-type': 'application/json', authorization: `Bearer ${token}` };
const conversations = (await (await fetch('http://localhost:3000/api/chat/conversations', { method: 'POST', headers: H, body: '{}' })).json()).conversations;

const rows = [];
for (const c of conversations.slice(0, 6)) {
  let before, guard = 0;
  for (;;) {
    const page = await (await fetch('http://localhost:3000/api/chat/history', {
      method: 'POST', headers: H, body: JSON.stringify({ conversationId: c.id, ...(before ? { before } : {}) }),
    })).json();
    const msgs = page.messages ?? [];
    for (const m of msgs) {
      if (m.sender === 'user') rows.push({ when: m.createdAt, has: !!m.check, status: m.check?.status ?? '-', text: m.text.slice(0, 34) });
    }
    guard++;
    if (!page.hasMore || !msgs.length || guard > 8) break;
    before = msgs[0].createdAt;
  }
}

rows.sort((a, b) => b.when.localeCompare(a.when));
console.log('user messages:', rows.length, 'with check:', rows.filter((r) => r.has).length);
console.log('most recent 18:');
for (const r of rows.slice(0, 18)) console.log(` ${r.when}  check=${r.has ? r.status : 'NONE'}  "${r.text}"`);
