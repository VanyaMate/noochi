import crypto from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { AppError } from '@noochi/shared';

export function newId(): string {
  return crypto.randomUUID();
}

// ---------- password hashing (scrypt, no native deps) ----------
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password.normalize('NFKC'), salt, 32);
  return `s1$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [v, saltHex, hashHex] = stored.split('$');
  if (v !== 's1' || !saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password.normalize('NFKC'), salt, expected.length);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// ---------- symmetric encryption for user API keys ----------
const ALGO = 'aes-256-gcm';

export function encryptSecret(plain: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decryptSecret(payload: string, keyHex: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(':');
  if (!ivHex || !tagHex || !dataHex) throw new AppError('INTERNAL', 'corrupt secret');
  const decipher = crypto.createDecipheriv(ALGO, Buffer.from(keyHex, 'hex'), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
}

export function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

// ---------- JWT ----------
export function jwtSecret(key: string): Uint8Array {
  return new TextEncoder().encode(key.padEnd(32, '.'));
}

export function signAccessToken(secret: string, user: { id: string; role: string; name: string }, ttl = '12h'): Promise<string> {
  return new SignJWT({ role: user.role, name: user.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(jwtSecret(secret));
}

export async function verifyAccessToken(secret: string, token: string): Promise<{ userId: string; role: string }> {
  const { payload } = await jwtVerify(token, jwtSecret(secret), { algorithms: ['HS256'] });
  if (!payload.sub) throw new AppError('UNAUTHORIZED', 'Bad token');
  return { userId: payload.sub, role: (payload.role as string) ?? 'user' };
}
