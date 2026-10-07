import { and, count, eq } from 'drizzle-orm';
import {
  AppError, S, PLANS,
  type BillingCheckReq, type BillingSubscribeReq, type PlanId, type PlanStatus,
} from '@noochi/shared';
import { characters, studyItems, subscriptions, planOf } from '@noochi/db';
import { newId, type Stack, type HandlerMap } from '@noochi/platform';

const DAY = 86_400;
const dayKey = (userId: string, kind: 'messages' | 'explains') =>
  `usage:${userId}:${kind}:${new Date().toISOString().slice(0, 10)}`;

async function usageOf(stack: Stack, userId: string, kind: 'messages' | 'explains'): Promise<number> {
  const v = await stack.cache.get(dayKey(userId, kind));
  return v ? Number(v) : 0;
}

export function billingHandlers(stack: Stack): HandlerMap {
  const { db } = stack;

  async function status(userId: string): Promise<PlanStatus> {
    const planId = await planOf(db, userId);
    const plan = PLANS[planId];
    const [studyN, charN] = await Promise.all([
      db.select({ n: count() }).from(studyItems).where(eq(studyItems.userId, userId)),
      db.select({ n: count() }).from(characters).where(eq(characters.ownerId, userId)),
    ]);
    const subs = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
    return {
      planId: plan.id,
      periodEnd: subs[0]?.periodEnd ? subs[0].periodEnd.toISOString() : null,
      limits: plan.limits,
      features: plan.features,
      usage: {
        messages: { used: await usageOf(stack, userId, 'messages'), limit: plan.limits.messagesPerDay },
        explains: { used: await usageOf(stack, userId, 'explains'), limit: plan.limits.explainsPerDay },
        studyItems: { used: studyN[0]?.n ?? 0, limit: plan.limits.studyItems },
        ownCharacters: { used: charN[0]?.n ?? 0, limit: plan.limits.ownCharacters },
      },
    };
  }

  return {
    [S.billing.status]: async ({ userId }: { userId: string }) => status(userId),

    [S.billing.subscribe]: async (req: BillingSubscribeReq) => {
      const existing = await db.select().from(subscriptions).where(eq(subscriptions.userId, req.userId)).limit(1);
      const values = {
        planId: req.planId as PlanId,
        status: 'active',
        periodEnd: new Date(Date.now() + 30 * 86400_000),
      };
      if (existing.length) {
        await db.update(subscriptions).set(values).where(eq(subscriptions.userId, req.userId));
      } else {
        await db.insert(subscriptions).values({ id: newId(), userId: req.userId, ...values });
      }
      stack.bus.publishDurable('evt.billing.plan_changed', { userId: req.userId, planId: req.planId });
      return status(req.userId);
    },

    [S.billing.check]: async (req: BillingCheckReq) => {
      const plan = PLANS[await planOf(db, req.userId)];
      return { allowed: !!plan.features[req.feature] };
    },

    [S.billing.increment]: async ({ userId, kind }: { userId: string; kind: 'messages' | 'explains' }) => {
      const plan = PLANS[await planOf(db, userId)];
      const limit = kind === 'messages' ? plan.limits.messagesPerDay : plan.limits.explainsPerDay;
      const used = await stack.cache.incr(dayKey(userId, kind), DAY);
      if (used > limit) {
        throw new AppError(
          kind === 'messages' ? 'LIMIT_MESSAGES' : 'LIMIT_EXPLAINS',
          kind === 'messages'
            ? `Daily chat limit is ${limit} on ${plan.name}. Upgrade for more, or come back tomorrow ☕`
            : `Daily explanation limit is ${limit} on ${plan.name}. Upgrade for more`,
          { limit, used },
        );
      }
      return { used, limit };
    },
  };
}
