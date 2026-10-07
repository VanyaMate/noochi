import { eq } from 'drizzle-orm';
import {
  PLANS, isPlanId,
  type Character, type Conversation, type Message, type PublicUser, type StudyItem,
  type PlanDef, type PlanFeature, type PlanId, type PlanLimits,
  type AiExplainRes, type ExplainRecord,
} from '@noochi/shared';
import type { Db } from './client.js';
import { characters, conversations, explains, messages, planDefs, studyItems, subscriptions, users } from './schema.js';

export function toPublicUser(row: typeof users.$inferSelect, planId: PlanId): PublicUser {
  return {
    id: row.id, email: row.email, name: row.name, role: row.role as PublicUser['role'],
    nativeLang: row.nativeLang, targetLang: row.targetLang, planId, banned: row.banned,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function fetchPublicUser(db: Db, userId: string): Promise<PublicUser | null> {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!rows.length) return null;
  const subs = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  return toPublicUser(rows[0], (subs[0]?.planId as PlanId) ?? 'free');
}

export function toCharacter(row: typeof characters.$inferSelect): Character {
  return {
    id: row.id, slug: row.slug, name: row.name, level: row.level as Character['level'],
    lang: row.lang, tagline: row.tagline, emoji: row.emoji, gradient: row.gradient,
    persona: row.persona, interests: row.interests ?? [], style: row.style,
    formality: row.formality as Character['formality'], welcome: row.welcome,
    extraPrompt: row.extraPrompt, isPublic: row.isPublic, ownerId: row.ownerId,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toConversation(row: typeof conversations.$inferSelect): Conversation {
  return {
    id: row.id, userId: row.userId, characterId: row.characterId,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    lastMessageAt: row.lastMessageAt ? row.lastMessageAt.toISOString() : null,
  };
}

export function toMessage(row: typeof messages.$inferSelect): Message {
  return {
    id: row.id, conversationId: row.conversationId, sender: row.sender as Message['sender'],
    characterId: row.characterId, text: row.text, requestId: row.requestId,
    check: row.check ?? null, createdAt: row.createdAt.toISOString(),
  };
}

export function toExplain(row: typeof explains.$inferSelect): ExplainRecord {
  return {
    id: row.id, term: row.term, context: row.context,
    nativeLang: row.nativeLang, targetLang: row.targetLang,
    result: row.result, createdAt: row.createdAt.toISOString(),
  };
}

export function toStudyItem(row: typeof studyItems.$inferSelect): StudyItem {
  return {
    id: row.id, userId: row.userId, kind: row.kind as StudyItem['kind'], term: row.term,
    translation: row.translation, meta: row.meta ?? {}, srsStep: row.srsStep,
    dueAt: row.dueAt.toISOString(), state: row.state as StudyItem['state'],
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}

export async function planOf(db: Db, userId: string): Promise<PlanId> {
  const subs = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  return (subs[0]?.planId as PlanId) ?? 'free';
}

/** Plan catalogue lives in the table; the shipped constants are only the seed and the fallback. */
export async function readPlanDefs(db: Db): Promise<Record<PlanId, PlanDef>> {
  const rows = await db.select().from(planDefs);
  const out: Record<PlanId, PlanDef> = { ...PLANS };
  for (const r of rows) {
    if (!isPlanId(r.id)) continue;
    out[r.id] = {
      id: r.id, name: r.name, tagline: r.tagline, priceMonthlyUSD: r.priceMonthlyUsd,
      limits: r.limits as PlanLimits, features: r.features as PlanFeature,
    };
  }
  return out;
}

/** Defaults are inserted once per plan, never overwritten — edits made in admin survive restarts. */
export async function seedPlanDefs(db: Db): Promise<void> {
  const existing = await db.select({ id: planDefs.id }).from(planDefs);
  const has = new Set(existing.map((e) => e.id));
  const missing = Object.values(PLANS).filter((p) => !has.has(p.id));
  if (!missing.length) return;
  await db.insert(planDefs).values(missing.map((p) => ({
    id: p.id, name: p.name, tagline: p.tagline, priceMonthlyUsd: p.priceMonthlyUSD,
    limits: p.limits, features: p.features,
  })));
}

export async function writePlanDef(db: Db, plan: PlanDef): Promise<void> {
  await db.insert(planDefs)
    .values({
      id: plan.id, name: plan.name, tagline: plan.tagline,
      priceMonthlyUsd: plan.priceMonthlyUSD, limits: plan.limits, features: plan.features,
    })
    .onConflictDoUpdate({
      target: planDefs.id,
      set: {
        name: plan.name, tagline: plan.tagline, priceMonthlyUsd: plan.priceMonthlyUSD,
        limits: plan.limits, features: plan.features, updatedAt: new Date(),
      },
    });
}
