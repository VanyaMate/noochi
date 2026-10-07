import { createDb, applyMigrations, type Db } from '@noochi/db';
import { NatsBus, LocalBus, type Bus } from '@noochi/bus';
import { createCache, type Cache } from '@noochi/cache';
import { detectMode, loadDotenv, readEnv, type AppEnv } from './env.js';

export interface Stack {
  env: AppEnv;
  bus: Bus;
  cache: Cache;
  db: Db;
  stop(): Promise<void>;
}

export async function makeStack(forceMode?: 'infra' | 'standalone'): Promise<Stack> {
  loadDotenv();
  const mode = forceMode ?? (await detectMode());
  const env = readEnv(mode);
  console.log(`[noochi] mode=${mode}`);

  const bus: Bus = mode === 'infra' ? new NatsBus(env.natsUrl) : new LocalBus();
  await bus.connect();

  const cache = createCache({ mode, redisUrl: env.redisUrl });
  const dbHandle = createDb(env);
  await applyMigrations(dbHandle);

  return {
    env, bus, cache, db: dbHandle.db,
    async stop() {
      await bus.close();
      await cache.close();
      await dbHandle.close();
    },
  };
}
