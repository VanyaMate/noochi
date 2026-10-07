import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

function loadDotenv(): void {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const envFile = path.join(dir, '.env');
    if (fs.existsSync(envFile) && fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(t);
        if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
      }
      return;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}

function root(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

/** DB-level mode: infra only matters when a real Postgres answers. */
export async function dbConfig(): Promise<{ mode: 'infra' | 'standalone'; databaseUrl: string; pgliteDir: string }> {
  loadDotenv();
  const databaseUrl = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/noochi';
  const pgliteDir = process.env.NOOCHI_PGLITE_DIR ?? path.join(root(), '.data', 'pglite');
  const forced = process.env.NOOCHI_MODE;
  if (forced === 'standalone') return { mode: 'standalone', databaseUrl, pgliteDir };
  const reachable = await new Promise<boolean>((resolve) => {
    let host = '127.0.0.1', port = 5432;
    try { const u = new URL(databaseUrl); host = u.hostname || host; if (u.port) port = Number(u.port); } catch { /* defaults */ }
    const s = net.connect({ host, port, timeout: 900 });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('timeout', () => { s.destroy(); resolve(false); });
    s.once('error', () => resolve(false));
  });
  return { mode: reachable ? 'infra' : 'standalone', databaseUrl, pgliteDir };
}
