import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { Pool } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import * as schema from './schema.js';

export { schema };

/** Both drivers expose the same query API; we standardize on the pg one. */
export type Db = ReturnType<typeof drizzlePg<typeof schema>>;

export interface DbConfig {
  mode: 'infra' | 'standalone';
  databaseUrl: string;
  pgliteDir: string;
}

export interface DbHandle {
  db: Db;
  kind: 'pg' | 'pglite';
  close(): Promise<void>;
}

export function createDb(cfg: DbConfig): DbHandle {
  if (cfg.mode === 'infra') {
    const pool = new Pool({ connectionString: cfg.databaseUrl, max: 5 });
    return { db: drizzlePg(pool, { schema }), kind: 'pg', close: () => pool.end() };
  }
  fs.mkdirSync(path.dirname(cfg.pgliteDir), { recursive: true });
  const client = new PGlite(cfg.pgliteDir);
  // The PGlite drizzle instance is structurally compatible with the pg one.
  const db = drizzlePglite(client, { schema }) as unknown as Db;
  return { db, kind: 'pglite', close: async () => { await client.close(); } };
}

export async function applyMigrations(handle: DbHandle): Promise<void> {
  const folder = fileURLToPath(new URL('../drizzle', import.meta.url));
  if (!fs.existsSync(folder)) {
    console.warn(`[noochi:db] no migrations folder at ${folder}; run "pnpm db:generate"`);
    return;
  }
  if (handle.kind === 'pg') await migratePg(handle.db, { migrationsFolder: folder });
  else await migratePglite(handle.db, { migrationsFolder: folder });
}
