import net from 'node:net';

const targets = [
  { name: 'postgres', host: process.env.PGHOST ?? '127.0.0.1', port: portFrom(process.env.DATABASE_URL, 5432) },
  { name: 'redis', host: process.env.REDIS_HOST ?? '127.0.0.1', port: portFrom(process.env.REDIS_URL, 6379) },
  { name: 'nats', host: process.env.NATS_HOST ?? '127.0.0.1', port: portFrom(process.env.NATS_URL, 4222) },
];

function portFrom(url, fallback) {
  if (!url) return fallback;
  try { const u = new URL(url); return u.port ? Number(u.port) : fallback; } catch { return fallback; }
}

function probe({ host, port }) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port, timeout: 900 });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('timeout', () => { s.destroy(); resolve(false); });
    s.once('error', () => resolve(false));
  });
}

const results = await Promise.all(targets.map(async (t) => ({ ...t, ok: await probe(t) })));
for (const r of results) console.log(`${r.ok ? 'OK  ' : 'DOWN'} ${r.name} ${r.host}:${r.port}`);
const allOk = results.every((r) => r.ok);
console.log(allOk ? 'mode=infra' : 'mode=standalone');
process.exit(allOk ? 0 : 1);
