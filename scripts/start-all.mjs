import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// Load .env if present (same rules as dev.mjs)
const envPath = path.resolve('.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

const mode = process.env.NOOCHI_MODE === 'standalone' ? 'standalone' : 'infra';

// one node process per unit (tsx loaded via --import, no pnpm/turbo/tsx wrappers)
const units = mode === 'infra'
  ? [
      ['service-auth', 'services/auth', 'src/main.ts'],
      ['service-users', 'services/users', 'src/main.ts'],
      ['service-bots', 'services/bots', 'src/main.ts'],
      ['service-chat', 'services/chat', 'src/main.ts'],
      ['service-ai', 'services/ai', 'src/main.ts'],
      ['service-study', 'services/study', 'src/main.ts'],
      ['service-billing', 'services/billing', 'src/main.ts'],
      ['service-analytics', 'services/analytics', 'src/main.ts'],
      ['gateway', 'apps/gateway', 'src/main.ts'],
    ]
  : [['devstack', 'apps/devstack', 'src/main.ts']];

const children = [];
let shuttingDown = false;

function start(name, dir, entry) {
  const abs = path.resolve(dir);
  const p = spawn(process.execPath, ['--import', 'tsx/esm', entry], {
    cwd: abs,
    stdio: 'inherit',
    env: { ...process.env, NOOCHI_MODE: mode, NOOCHI_UNIT: name },
  });
  children.push([name, p]);
  p.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.log(`[noochi] ${name} exited (code=${code} signal=${signal}) — shutting down all units`);
    shutdown(1);
  });
  return p;
}

function shutdown(code) {
  shuttingDown = true;
  for (const [, p] of children) p.kill('SIGTERM');
  setTimeout(() => process.exit(code), 400);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log(`[noochi] ${mode} mode — ${units.length} unit process(es)`);
for (const [name, dir, entry] of units) start(name, dir, entry);

// web dev server alongside (single vite process, resolved from apps/web)
let viteBin = null;
try {
  const req = createRequire(path.join(path.resolve('apps/web'), 'noop.js'));
  const pkgJson = req.resolve('vite/package.json');
  viteBin = path.resolve(path.dirname(pkgJson), req(pkgJson).bin.vite);
} catch { /* vite not installed */ }
if (!viteBin) {
  console.log('[noochi] vite not found for apps/web — run `pnpm install`');
} else {
  const web = spawn(process.execPath, [viteBin], {
    cwd: path.resolve('apps/web'),
    stdio: 'inherit',
  });
  children.push(['web', web]);
  web.on('exit', (code) => { if (!shuttingDown && code !== 0 && code !== null) shutdown(code); });
}
