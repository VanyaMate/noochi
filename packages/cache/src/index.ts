import { Redis } from 'ioredis';

export interface Cache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec?: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Increment with TTL applied on first write; returns new value. */
  incr(key: string, ttlSec: number): Promise<number>;
  close(): Promise<void>;
}

export class RedisCache implements Cache {
  private redis: Redis;
  constructor(url: string) {
    this.redis = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: false });
  }
  async get(key: string) { return this.redis.get(key); }
  async set(key: string, value: string, ttlSec?: number) {
    if (ttlSec) await this.redis.set(key, value, 'EX', ttlSec);
    else await this.redis.set(key, value);
  }
  async del(key: string) { await this.redis.del(key); }
  async incr(key: string, ttlSec: number) {
    const v = await this.redis.incr(key);
    if (v === 1) await this.redis.expire(key, ttlSec);
    return v;
  }
  async close() { await this.redis.quit(); }
}

export class MemoryCache implements Cache {
  private map = new Map<string, { value: string; expiresAt: number | null }>();

  async get(key: string) {
    const e = this.map.get(key);
    if (!e) return null;
    if (e.expiresAt && e.expiresAt < Date.now()) { this.map.delete(key); return null; }
    return e.value;
  }
  async set(key: string, value: string, ttlSec?: number) {
    this.map.set(key, { value, expiresAt: ttlSec ? Date.now() + ttlSec * 1000 : null });
  }
  async del(key: string) { this.map.delete(key); }
  async incr(key: string, ttlSec: number) {
    const cur = await this.get(key);
    const next = (cur ? Number(cur) : 0) + 1;
    this.map.set(key, {
      value: String(next),
      expiresAt: Number(cur ?? 0) === 0 ? Date.now() + ttlSec * 1000 : (this.map.get(key)?.expiresAt ?? Date.now() + ttlSec * 1000),
    });
    return next;
  }
  async close() { this.map.clear(); }
}

export function createCache(opts: { mode: 'infra' | 'standalone'; redisUrl?: string }): Cache {
  if (opts.mode === 'infra' && opts.redisUrl) return new RedisCache(opts.redisUrl);
  return new MemoryCache();
}
