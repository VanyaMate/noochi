import net from 'node:net';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Load .env if present (no deps)
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

function portFrom(url, hostEnv, fallback) {
  if (!url) return { host: process.env[hostEnv] ?? '127.0.0.1', port: fallback };
  try { const u = new URL(url); return { host: u.hostname || '127.0.0.1', port: u.port ? Number(u.port) : fallback }; }
  catch { return { host: '127.0.0.1', port: fallback }; }
}

function probe(target) {
  return new Promise((resolve) => {
    const s = net.connect({ host: target.host, port: target.port, timeout: 900 });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('timeout', () => { s.destroy(); resolve(false); });
    s.once('error', () => resolve(false));
  });
}

let mode = process.env.NOOCHI_MODE;
if (mode !== 'infra' && mode !== 'standalone') {
  const checks = [
    portFrom(process.env.DATABASE_URL, 'PGHOST', 5432),
    portFrom(process.env.REDIS_URL, 'REDIS_HOST', 6379),
    portFrom(process.env.NATS_URL, 'NATS_HOST', 4222),
  ];
  const ok = (await Promise.all(checks.map(probe))).every(Boolean);
  mode = ok ? 'infra' : 'standalone';
}

console.log(`[noochi] starting in ${mode} mode ${mode === 'standalone' ? '(no Docker needed)' : '(using local pg/redis/nats)'}`);
if (!fs.existsSync('.env') && fs.existsSync('.env.example')) {
  console.log('[noochi] tip: cp .env.example .env to override defaults');
}

const child = spawn(process.execPath, ['scripts/start-all.mjs'], {
  stdio: 'inherit',
  env: { ...process.env, NOOCHI_MODE: mode },
});
child.on('exit', (code) => process.exit(code ?? 0));
