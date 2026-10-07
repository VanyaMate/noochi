import { and, count, eq, or } from 'drizzle-orm';
import {
  AppError, S, PLANS,
  type BotsCatalogReq, type BotsCreateReq, type BotsUpdateReq,
} from '@noochi/shared';
import { characters, fetchPublicUser, planOf, toCharacter } from '@noochi/db';
import { newId, type Stack, type HandlerMap } from '@noochi/platform';

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'char';
}

async function canManage(stack: Stack, characterId: string, userId: string) {
  const rows = await stack.db.select().from(characters).where(eq(characters.id, characterId)).limit(1);
  if (!rows.length) throw new AppError('NOT_FOUND', 'No such character');
  const actor = await fetchPublicUser(stack.db, userId);
  if (rows[0].ownerId === userId) return { row: rows[0], admin: actor?.role === 'admin' };
  if (actor?.role === 'admin') return { row: rows[0], admin: true };
  throw new AppError('FORBIDDEN', 'Only the author or an admin can change this character');
}

export function botsHandlers(stack: Stack): HandlerMap {
  const { db } = stack;
  return {
    [S.bots.catalog]: async (req: BotsCatalogReq) => {
      const conds = [or(eq(characters.isPublic, true), req.userId ? eq(characters.ownerId, req.userId) : undefined)];
      if (req.level) conds.push(eq(characters.level, req.level));
      if (req.lang) conds.push(eq(characters.lang, req.lang));
      const rows = await db.select().from(characters).where(and(...conds));
      return rows.map(toCharacter);
    },

    [S.bots.get]: async ({ characterId }: { characterId: string }) => {
      const rows = await db.select().from(characters).where(eq(characters.id, characterId)).limit(1);
      if (!rows.length) throw new AppError('NOT_FOUND', 'No such character');
      return toCharacter(rows[0]);
    },

    [S.bots.create]: async (req: BotsCreateReq) => {
      const plan = PLANS[await planOf(db, req.userId)];
      if (!plan.features.ownCharacters) throw new AppError('FEATURE_NOT_IN_PLAN', 'Creating your own characters is a Plus feature');
      const mine = await db.select({ n: count() }).from(characters).where(eq(characters.ownerId, req.userId));
      if ((mine[0]?.n ?? 0) >= plan.limits.ownCharacters) {
        throw new AppError('LIMIT_CHARACTERS', `Your plan allows ${plan.limits.ownCharacters} characters`);
      }
      const id = newId();
      const row = {
        id, slug: `${slugify(req.name)}-${id.slice(0, 4)}`,
        name: req.name, level: req.level, lang: req.lang, tagline: req.tagline,
        emoji: req.emoji, gradient: req.gradient, persona: req.persona,
        interests: req.interests, style: req.style, formality: req.formality,
        welcome: req.welcome || 'hi! nice to meet you :)',
        extraPrompt: req.extraPrompt, isPublic: false, ownerId: req.userId,
      };
      await db.insert(characters).values(row);
      return toCharacter({ ...row, createdAt: new Date(), updatedAt: new Date() });
    },

    [S.bots.update]: async (req: BotsUpdateReq) => {
      const { row } = await canManage(stack, req.characterId, req.userId);
      const patch: Partial<typeof characters.$inferInsert> = { updatedAt: new Date() };
      for (const k of ['name', 'level', 'lang', 'tagline', 'emoji', 'gradient', 'persona', 'interests', 'style', 'formality', 'welcome', 'extraPrompt', 'isPublic'] as const) {
        const v = (req as Record<string, unknown>)[k];
        if (v !== undefined) (patch as Record<string, unknown>)[k] = v;
      }
      await db.update(characters).set(patch).where(eq(characters.id, req.characterId));
      const fresh = await db.select().from(characters).where(eq(characters.id, row.id)).limit(1);
      return toCharacter(fresh[0]);
    },

    [S.bots.remove]: async ({ characterId, userId }: { characterId: string; userId: string }) => {
      await canManage(stack, characterId, userId);
      await db.delete(characters).where(eq(characters.id, characterId));
      return { ok: true } as const;
    },
  };
}
