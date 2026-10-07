import { and, asc, count, eq } from 'drizzle-orm';
import {
  AppError, S, PLANS, SRS_INTERVALS_DAYS,
  type StudyAddReq, type StudyListReq, type StudyRemoveReq, type StudyReviewReq,
} from '@noochi/shared';
import { studyItems, planOf, toStudyItem } from '@noochi/db';
import { newId, type Stack, type HandlerMap } from '@noochi/platform';

function nextReview(step: number, grade: 'again' | 'hard' | 'good' | 'easy'): { step: number; due: Date; state: 'new' | 'learning' | 'known' } {
  let next = step;
  if (grade === 'again') next = 0;
  if (grade === 'hard') next = Math.max(0, step - 1);
  if (grade === 'good') next = Math.min(SRS_INTERVALS_DAYS.length - 1, step + 1);
  if (grade === 'easy') next = Math.min(SRS_INTERVALS_DAYS.length - 1, step + 2);
  const days = grade === 'again' ? 0 : SRS_INTERVALS_DAYS[next];
  const state = next >= SRS_INTERVALS_DAYS.length - 2 ? 'known' : next === 0 ? 'new' : 'learning';
  return { step: next, due: new Date(Date.now() + days * 86400_000), state };
}

export function studyHandlers(stack: Stack): HandlerMap {
  const { db } = stack;
  return {
    [S.study.add]: async (req: StudyAddReq) => {
      const plan = PLANS[await planOf(db, req.userId)];
      const existing = await db.select().from(studyItems)
        .where(and(eq(studyItems.userId, req.userId), eq(studyItems.kind, req.kind), eq(studyItems.term, req.term)))
        .limit(1);
      if (existing.length) {
        await db.update(studyItems)
          .set({ meta: req.meta, translation: req.translation ?? existing[0].translation, updatedAt: new Date() })
          .where(eq(studyItems.id, existing[0].id));
        const fresh = await db.select().from(studyItems).where(eq(studyItems.id, existing[0].id)).limit(1);
        return toStudyItem(fresh[0]);
      }
      const total = await db.select({ n: count() }).from(studyItems).where(eq(studyItems.userId, req.userId));
      if ((total[0]?.n ?? 0) >= plan.limits.studyItems) {
        throw new AppError('LIMIT_STUDY_ITEMS', `Your plan holds up to ${plan.limits.studyItems} study items`);
      }
      const row = {
        id: newId(), userId: req.userId, kind: req.kind, term: req.term,
        translation: req.translation, meta: req.meta, srsStep: 0,
        dueAt: new Date(), state: 'new' as const, createdAt: new Date(), updatedAt: new Date(),
      };
      await db.insert(studyItems).values(row);
      stack.bus.publishDurable('evt.study.added', { userId: req.userId, itemId: row.id });
      return toStudyItem(row);
    },

    [S.study.list]: async (req: StudyListReq) => {
      const conds = [eq(studyItems.userId, req.userId)];
      if (req.kind) conds.push(eq(studyItems.kind, req.kind));
      if (req.state) conds.push(eq(studyItems.state, req.state));
      let q = db.select().from(studyItems).where(and(...conds));
      if (req.dueOnly) {
        const rows = await q.orderBy(asc(studyItems.dueAt));
        const now = Date.now();
        return rows.filter((r) => r.dueAt.getTime() <= now).map(toStudyItem);
      }
      const rows = await q.orderBy(asc(studyItems.dueAt));
      return rows.map(toStudyItem);
    },

    [S.study.remove]: async (req: StudyRemoveReq) => {
      const deleted = await db.delete(studyItems)
        .where(and(eq(studyItems.id, req.itemId), eq(studyItems.userId, req.userId)))
        .returning({ id: studyItems.id });
      if (!deleted.length) throw new AppError('NOT_FOUND', 'Nothing to remove');
      return { ok: true } as const;
    },

    [S.study.review]: async (req: StudyReviewReq) => {
      const rows = await db.select().from(studyItems)
        .where(and(eq(studyItems.id, req.itemId), eq(studyItems.userId, req.userId))).limit(1);
      if (!rows.length) throw new AppError('NOT_FOUND', 'No such item');
      const next = nextReview(rows[0].srsStep, req.grade);
      await db.update(studyItems)
        .set({ srsStep: next.step, dueAt: next.due, state: next.state, updatedAt: new Date() })
        .where(eq(studyItems.id, req.itemId));
      const fresh = await db.select().from(studyItems).where(eq(studyItems.id, req.itemId)).limit(1);
      return toStudyItem(fresh[0]);
    },
  };
}
