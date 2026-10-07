import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  AppError, S, type LoginReq, type PublicUser, type RefreshReq, type RegisterReq,
} from '@noochi/shared';
import { users, refreshTokens, subscriptions, fetchPublicUser } from '@noochi/db';
import {
  hashPassword, verifyPassword, newId, sha256, signAccessToken,
  type Stack, type HandlerMap,
} from '@noochi/platform';

const REFRESH_DAYS = 30;

async function signTokens(stack: Stack, user: PublicUser) {
  const accessToken = await signAccessToken(stack.env.jwtSecret, { id: user.id, role: user.role, name: user.name });
  const refreshToken = crypto.randomBytes(32).toString('hex');
  await stack.db.insert(refreshTokens).values({
    id: newId(),
    userId: user.id,
    tokenHash: sha256(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_DAYS * 86400_000),
  });
  return { accessToken, refreshToken };
}

export function authHandlers(stack: Stack): HandlerMap {
  const { db } = stack;
  return {
    [S.auth.register]: async (req: RegisterReq) => {
      const email = req.email.toLowerCase();
      const dup = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (dup.length) throw new AppError('CONFLICT', 'This email is already registered');
      const id = newId();
      await db.insert(users).values({
        id, email, name: req.name, passwordHash: hashPassword(req.password),
        nativeLang: req.nativeLang, targetLang: req.targetLang, role: 'user',
      });
      await db.insert(subscriptions).values({ id: newId(), userId: id, planId: 'free', status: 'active' });
      const user = (await fetchPublicUser(db, id))!;
      const tokens = await signTokens(stack, user);
      stack.bus.publishDurable('evt.user.registered', { userId: id });
      return { user, tokens };
    },

    [S.auth.login]: async (req: LoginReq) => {
      const rows = await db.select().from(users).where(eq(users.email, req.email.toLowerCase())).limit(1);
      if (!rows.length || !verifyPassword(req.password, rows[0].passwordHash)) {
        throw new AppError('UNAUTHORIZED', 'Wrong email or password');
      }
      if (rows[0].banned) throw new AppError('FORBIDDEN', 'Account is blocked');
      const user = (await fetchPublicUser(db, rows[0].id))!;
      const tokens = await signTokens(stack, user);
      return { user, tokens };
    },

    [S.auth.refresh]: async (req: RefreshReq) => {
      const hash = sha256(req.refreshToken);
      const rows = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, hash)).limit(1);
      if (!rows.length || rows[0].expiresAt < new Date()) throw new AppError('UNAUTHORIZED', 'Session expired');
      await db.delete(refreshTokens).where(eq(refreshTokens.id, rows[0].id)); // rotate
      const user = await fetchPublicUser(db, rows[0].userId);
      if (!user || user.banned) throw new AppError('UNAUTHORIZED', 'Session expired');
      return await signTokens(stack, user);
    },

    [S.auth.me]: async ({ userId }: { userId: string }) => {
      const user = await fetchPublicUser(db, userId);
      if (!user) throw new AppError('NOT_FOUND', 'No such user');
      return user;
    },
  };
}
