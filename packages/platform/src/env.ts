import fs from 'node:fs';
import path from 'node:path';

/** Load .env from the workspace root (searched upward from cwd), without overriding existing vars. */
export function loadDotenv(): void {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const envFile = path.join(dir, '.env');
    if (fs.existsSync(envFile) && fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
        if (!m) continue;
        const key = m[1];
        const value = m[2].trim().replace(/^["']|["']$/g, '');
        if (process.env[key] === undefined) process.env[key] = value;
      }
      return;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}

export type RunMode = 'infra' | 'standalone';

import net from 'node:net';

function probe(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ host, port, timeout: 900 });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('timeout', () => { s.destroy(); resolve(false); });
    s.once('error', () => resolve(false));
  });
}

function urlHostPort(url: string | undefined, defHost: string, defPort: number) {
  if (!url) return { host: defHost, port: defPort };
  try {
    const u = new URL(url);
    return { host: u.hostname || defHost, port: u.port ? Number(u.port) : defPort };
  } catch {
    return { host: defHost, port: defPort };
  }
}

export async function detectMode(): Promise<RunMode> {
  const forced = process.env.NOOCHI_MODE;
  if (forced === 'infra' || forced === 'standalone') return forced;
  const pg = urlHostPort(process.env.DATABASE_URL, '127.0.0.1', 5432);
  const redis = urlHostPort(process.env.REDIS_URL, '127.0.0.1', 6379);
  const nats = urlHostPort(process.env.NATS_URL, '127.0.0.1', 4222);
  const ok = (await Promise.all([probe(pg.host, pg.port), probe(redis.host, redis.port), probe(nats.host, nats.port)])).every(Boolean);
  return ok ? 'infra' : 'standalone';
}

export interface AppEnv {
  mode: RunMode;
  databaseUrl: string;
  pgliteDir: string;
  natsUrl: string;
  redisUrl: string;
  jwtSecret: string;
  secretsKey: string; // 64 hex chars
  openrouterApiKey: string;
  openrouterBaseUrl: string;
  gatewayPort: number;
}

export function readEnv(mode: RunMode): AppEnv {
  const root = findWorkspaceRoot();
  return {
    mode,
    databaseUrl: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/noochi',
    pgliteDir: process.env.NOOCHI_PGLITE_DIR ?? path.join(root, '.data', 'pglite'),
    natsUrl: process.env.NATS_URL ?? 'nats://localhost:4222',
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
    jwtSecret: process.env.JWT_SECRET ?? 'dev-only-change-me',
    secretsKey: process.env.SECRETS_KEY ?? '0000000000000000000000000000000000000000000000000000000000000001',
    openrouterApiKey: process.env.OPENROUTER_API_KEY ?? '',
    // swap for a proxy/gateway or a local mock: must point at the .../api/v1 root
    openrouterBaseUrl: (process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1').replace(/\/+$/, ''),
    gatewayPort: Number(process.env.GATEWAY_PORT ?? 3000),
  };
}

export function findWorkspaceRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}
