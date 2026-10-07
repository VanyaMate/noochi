import { login, BASE } from './probe-lib.mjs';

const token = await login();
const call = (path, body) => fetch(`${BASE}${path}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify(body ?? {}),
}).then((x) => x.json());

const convs = await call('/api/chat/conversations', {});
let bot = 0, leaked = 0, markerish = 0;
for (const c of convs.conversations) {
  const h = await call('/api/chat/history', { conversationId: c.id, limit: 50 });
  for (const m of h.messages) {
    if (m.sender !== 'bot') continue;
    bot++;
    const tail = m.text.slice(-260).replace(/\s+/g, ' ');
    if (/CHECK/i.test(m.text)) markerish++;
    else if (/"(ok|summary|issues|polished)"/.test(m.text)) leaked++;
    console.log(`--- ${c.id.slice(0, 6)} ${m.createdAt}\n${tail}\n`);
  }
}
console.log(JSON.stringify({ bot, withCheckWord: markerish, bareJsonTail: leaked }));
