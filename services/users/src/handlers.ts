import { and, count, ilike, or, eq, desc } from 'drizzle-orm';
import {
  AppError, S, DEFAULT_MODEL, type PlanId,
  type AiSettingsView, type UsersUpdateReq, type UsersSetAiReq,
  type UsersAdminListReq, type UsersAdminUpdateReq,
} from '@noochi/shared';
import { users, userAiSettings, subscriptions, fetchPublicUser, toPublicUser } from '@noochi/db';
import { encryptSecret, decryptSecret, newId, type Stack, type HandlerMap } from '@noochi/platform';

async function aiView(stack: Stack, userId: string): Promise<AiSettingsView> {
  const rows = await stack.db.select().from(userAiSettings).where(eq(userAiSettings.userId, userId)).limit(1);
  const row = rows[0];
  let keyHint: string | null = null;
  if (row?.apiKeyEnc) {
    try {
      const plain = decryptSecret(row.apiKeyEnc, stack.env.secretsKey);
      keyHint = plain.slice(-4);
    } catch { keyHint = '????'; }
  }
  return {
    model: row?.model ?? DEFAULT_MODEL,
    temperature: (row?.temperature ?? 70) / 100,
    hasUserKey: !!row?.apiKeyEnc,
    keyHint,
  };
}

export function usersHandlers(stack: Stack): HandlerMap {
  const { db } = stack;
  return {
    [S.users.get]: async ({ userId }: { userId: string }) => {
      const user = await fetchPublicUser(db, userId);
      if (!user) throw new AppError('NOT_FOUND', 'No such user');
      return { user, ai: await aiView(stack, userId) };
    },

    [S.users.update]: async (req: UsersUpdateReq) => {
      const patch: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
      if (req.name !== undefined) patch.name = req.name;
      if (req.nativeLang !== undefined) patch.nativeLang = req.nativeLang;
      if (req.targetLang !== undefined) patch.targetLang = req.targetLang;
      await db.update(users).set(patch).where(eq(users.id, req.userId));
      const user = await fetchPublicUser(db, req.userId);
      if (!user) throw new AppError('NOT_FOUND', 'No such user');
      return user;
    },

    [S.users.setAi]: async (req: UsersSetAiReq) => {
      const existing = await db.select().from(userAiSettings).where(eq(userAiSettings.userId, req.userId)).limit(1);
      const values: Partial<typeof userAiSettings.$inferInsert> = { userId: req.userId, updatedAt: new Date() };
      if (req.model) values.model = req.model;
      if (req.temperature !== undefined) values.temperature = Math.round(req.temperature * 100);
      if (req.apiKey !== undefined) {
        values.apiKeyEnc = req.apiKey === null || req.apiKey === '' ? null : encryptSecret(req.apiKey, stack.env.secretsKey);
      }
      if (existing.length) {
        const { userId, ...set } = values;
        await db.update(userAiSettings).set(set).where(eq(userAiSettings.userId, req.userId));
      } else {
        await db.insert(userAiSettings).values({
          userId: req.userId,
          model: values.model ?? DEFAULT_MODEL,
          temperature: values.temperature ?? 70,
          apiKeyEnc: values.apiKeyEnc ?? null,
        });
      }
      return aiView(stack, req.userId);
    },

    [S.users.adminList]: async (req: UsersAdminListReq) => {
      const where = req.query
        ? or(ilike(users.email, `%${req.query}%`), ilike(users.name, `%${req.query}%`))
        : undefined;
      const totalRows = await db.select({ n: count() }).from(users).where(where);
      const rows = await db.select().from(users).where(where).orderBy(desc(users.createdAt))
        .limit(req.pageSize).offset((req.page - 1) * req.pageSize);
      const ids = rows.map((r) => r.id);
      const subs = ids.length
        ? await db.select().from(subscriptions).where(or(...ids.map((id) => eq(subscriptions.userId, id))))
        : [];
      const planByUser = new Map(subs.map((s) => [s.userId, s.planId]));
      return {
        total: totalRows[0]?.n ?? 0,
        items: rows.map((r) => toPublicUser(r, (planByUser.get(r.id) as PlanId | undefined) ?? 'free')),
      };
    },

    [S.users.adminUpdate]: async (req: UsersAdminUpdateReq) => {
      if (!await fetchPublicUser(db, req.userId)) throw new AppError('NOT_FOUND', 'No such user');
      const patch: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
      if (req.role !== undefined) patch.role = req.role;
      if (req.banned !== undefined) patch.banned = req.banned;
      await db.update(users).set(patch).where(eq(users.id, req.userId));
      if (req.planId !== undefined) {
        const sub = await db.select().from(subscriptions).where(eq(subscriptions.userId, req.userId)).limit(1);
        if (sub.length) {
          await db.update(subscriptions).set({ planId: req.planId, status: 'active' }).where(eq(subscriptions.userId, req.userId));
        } else {
          await db.insert(subscriptions).values({ id: newId(), userId: req.userId, planId: req.planId, status: 'active' });
        }
      }
      const user = await fetchPublicUser(db, req.userId);
      return user!;
    },
  };
}
