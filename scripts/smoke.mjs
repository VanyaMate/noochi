const BASE = process.env.BASE ?? 'http://localhost:3000';
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
  cond ? pass++ : fail++;
};

const post = async (path, body, token) => {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};

{
  const r = await fetch(BASE + '/healthz');
  ok('healthz', r.status === 200, (await r.text()).slice(0, 60));
}
const plans = await (await fetch(BASE + '/api/billing/plans')).json();
ok('plans static', Array.isArray(plans) && plans.length === 3);

// fresh user each run so the test is repeatable
const email = `smoke-${Date.now()}@test.dev`;
let token = '';
{
  const r = await post('/api/auth/register', { email, password: 'smoketest-42', name: 'Smoke', nativeLang: 'ru', targetLang: 'en' });
  ok('register', r.status === 200 && r.json?.tokens?.accessToken, JSON.stringify(r.json ?? {}).slice(0, 120));
  token = r.json?.tokens?.accessToken ?? '';
}
{
  const r = await post('/api/auth/login', { email, password: 'smoketest-42' });
  ok('login', r.status === 200 && !!r.json?.tokens?.accessToken);
  token = r.json?.tokens?.accessToken ?? token;
}
{
  const r = await post('/api/auth/me', {}, token);
  ok('me free plan', r.json?.planId === 'free' && r.json?.name === 'Smoke');
}
let paulId = '';
{
  const r = await post('/api/bots/catalog', {}, token);
  const byLevel = [...new Set((r.json ?? []).map((c) => c.level))].sort();
  ok('catalog 10 chars A1..C2', (r.json ?? []).length >= 10, byLevel.join(','));
  paulId = (r.json ?? []).find((c) => c.slug === 'paul-bakery')?.id ?? '';
}
let convId = '';
{
  const r = await post('/api/chat/open', { characterId: paulId }, token);
  convId = r.json?.conversation?.id ?? '';
  ok('open chat + welcome', !!convId && r.json.messages?.[0]?.text?.toLowerCase().includes('paul'), r.json?.messages?.[0]?.text);
}
{
  const r = await post('/api/chat/send', { conversationId: convId, text: 'hi Paul!', requestId: 'smoke-req-1' }, token);
  ok('send without key -> AI_KEY_MISSING', r.status === 400 && r.json?.error?.code === 'AI_KEY_MISSING', JSON.stringify(r.json?.error ?? {}).slice(0, 100));
}
{
  const hist = await post('/api/chat/history', { conversationId: convId }, token);
  ok('system hint message stored', (hist.json?.messages ?? []).some((m) => m.sender === 'system'));
}
{
  const r = await post('/api/study/add', { kind: 'word', term: 'knead', translation: 'месить', meta: { why: 'тест' } }, token);
  ok('study add', !!r.json?.id);
}
{
  const r = await post('/api/study/list', {}, token);
  ok('study list', (r.json ?? []).length === 1);
}
{
  const r = await post('/api/billing/status', {}, token);
  ok('billing status free 30/day', r.json?.planId === 'free' && r.json?.usage?.messages?.limit === 30);
}
{
  const r = await post('/api/billing/subscribe', { planId: 'plus' }, token);
  ok('subscribe plus', r.json?.planId === 'plus' && r.json?.limits?.messagesPerDay === 300);
}
{
  const r = await post('/api/bots/create', {
    name: 'Smoke Bot', level: 'A2', tagline: 'test char', emoji: '🤖', gradient: 'from-amber-200 to-rose-300',
    persona: 'A tiny test character created by the smoke script for testing purposes.', interests: ['testing'], style: 'short', formality: 'casual', welcome: 'beep',
  }, token);
  ok('own character (plus)', !!r.json?.id && r.json?.isPublic === false, JSON.stringify(r.json ?? {}).slice(0, 100));
}
{
  const item = (await post('/api/study/list', { kind: 'word' }, token)).json[0];
  const rv = await post('/api/study/review', { itemId: item.id, grade: 'good' }, token);
  ok('review advances srs', rv.json?.state === 'learning' && new Date(rv.json?.dueAt) > new Date());
}
{
  const admin = await post('/api/auth/login', { email: 'admin@noochi.app', password: 'noochi-admin-42' });
  const at = admin.json?.tokens?.accessToken ?? '';
  const r = await post('/api/admin/overview', {}, at);
  ok('admin overview', r.json?.users >= 3 && typeof r.json?.messagesToday === 'number', JSON.stringify(r.json ?? {}).slice(0, 90));
  const denied = await post('/api/admin/overview', {}, token);
  ok('admin gate for user', denied.status === 403);
}
{
  const r = await post('/api/users/set-ai', { apiKey: 'sk-or-v1-test123', model: 'anthropic/claude-3.5-haiku' }, token);
  ok('set ai key', r.json?.hasUserKey === true && r.json?.keyHint === 't123', JSON.stringify(r.json));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
