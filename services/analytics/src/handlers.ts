import { and, count, eq, gte } from 'drizzle-orm';
import {
  AppError, S, PLANS,
  type AdminOverview, type AnalyticsSummary,
} from '@noochi/shared';
import { characters, conversations, messages, studyItems, subscriptions, users, planOf } from '@noochi/db';
import type { Stack, HandlerMap } from '@noochi/platform';

function lastNDays(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    out.push(new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10));
  }
  return out;
}

function streak(days: Set<string>): number {
  let s = 0;
  for (const d of lastNDays(365).reverse()) {
    if (days.has(d)) s++;
    else if (s > 0 || d !== new Date().toISOString().slice(0, 10)) break;
  }
  return s;
}

export function analyticsHandlers(stack: Stack): HandlerMap {
  const { db } = stack;
  return {
    [S.analytics.summary]: async ({ userId }: { userId: string }) => {
      const plan = PLANS[await planOf(db, userId)];
      if (plan.features.analytics === 'none') {
        throw new AppError('FEATURE_NOT_IN_PLAN', 'Analytics is a Plus/Pro feature');
      }
      const since = new Date(Date.now() - 30 * 86400_000);
      const [msgRows, items, reviews] = await Promise.all([
        db.select({ createdAt: messages.createdAt, sender: messages.sender }).from(messages)
          .where(gte(messages.createdAt, since)),
        db.select({ state: studyItems.state }).from(studyItems).where(eq(studyItems.userId, userId)),
        db.select({ updatedAt: studyItems.updatedAt }).from(studyItems)
          .where(and(eq(studyItems.userId, userId), gte(studyItems.updatedAt, since))),
      ]);
      const userMsgs = msgRows.filter((m) => m.sender === 'user');
      const byDay = new Map<string, number>();
      for (const m of userMsgs) {
        const d = m.createdAt.toISOString().slice(0, 10);
        byDay.set(d, (byDay.get(d) ?? 0) + 1);
      }
      const revByDay = new Map<string, number>();
      for (const r of reviews) {
        const d = r.updatedAt.toISOString().slice(0, 10);
        revByDay.set(d, (revByDay.get(d) ?? 0) + 1);
      }
      const messagesByDay = lastNDays(30).map((date) => ({ date, count: byDay.get(date) ?? 0 }));
      const summary: AnalyticsSummary = {
        messagesByDay,
        wordsTotal: items.length,
        wordsMature: items.filter((i) => i.state === 'known').length,
        reviewsByDay: lastNDays(30).map((date) => ({ date, count: revByDay.get(date) ?? 0 })),
        streakDays: streak(new Set(byDay.keys())),
        activeDays: byDay.size,
        mostCorrected: [],
      };
      return summary;
    },

    [S.analytics.adminOverview]: async () => {
      const today = new Date(); today.setUTCHours(0, 0, 0, 0);
      const [uAll, uPro, uPlus, uBanned, convs, chars, custom, msgsToday, recent] = await Promise.all([
        db.select({ n: count() }).from(users),
        db.select({ n: count() }).from(users).innerJoin(subscriptions, eq(users.id, subscriptions.userId)).where(eq(subscriptions.planId, 'pro')),
        db.select({ n: count() }).from(users).innerJoin(subscriptions, eq(users.id, subscriptions.userId)).where(eq(subscriptions.planId, 'plus')),
        db.select({ n: count() }).from(users).where(eq(users.banned, true)),
        db.select({ n: count() }).from(conversations),
        db.select({ n: count() }).from(characters),
        db.select({ n: count() }).from(characters).where(eq(characters.isPublic, false)),
        db.select({ n: count() }).from(messages).where(gte(messages.createdAt, today)),
        db.select({ createdAt: users.createdAt }).from(users).where(gte(users.createdAt, new Date(Date.now() - 7 * 86400_000))),
      ]);
      const signups = new Map<string, number>();
      for (const r of recent) {
        const d = r.createdAt.toISOString().slice(0, 10);
        signups.set(d, (signups.get(d) ?? 0) + 1);
      }
      const overview: AdminOverview = {
        users: uAll[0]?.n ?? 0,
        bannedUsers: uBanned[0]?.n ?? 0,
        proUsers: uPro[0]?.n ?? 0,
        plusUsers: uPlus[0]?.n ?? 0,
        messagesToday: msgsToday[0]?.n ?? 0,
        conversations: convs[0]?.n ?? 0,
        characters: chars[0]?.n ?? 0,
        customCharacters: custom[0]?.n ?? 0,
        signupsLast7: lastNDays(7).map((date) => ({ date, count: signups.get(date) ?? 0 })),
      };
      return overview;
    },
  };
}
