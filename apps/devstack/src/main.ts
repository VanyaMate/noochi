import { eq } from 'drizzle-orm';
import { makeStack, hashPassword, newId, type HandlerMap } from '@noochi/platform';
import { users, characters, subscriptions, type Db } from '@noochi/db';
import { SEED_CHARACTERS } from '@noochi/db/seed-data';
import { createGateway } from '@noochi/gateway';
import { authHandlers } from '@noochi/service-auth';
import { usersHandlers } from '@noochi/service-users';
import { botsHandlers } from '@noochi/service-bots';
import { chatHandlers } from '@noochi/service-chat';
import { aiHandlers } from '@noochi/service-ai';
import { studyHandlers } from '@noochi/service-study';
import { billingHandlers } from '@noochi/service-billing';
import { analyticsHandlers } from '@noochi/service-analytics';
import type { SubjectName } from '@noochi/shared';

async function ensureSeed(db: Db) {
  const anyUser = await db.select({ id: users.id }).from(users).limit(1);
  if (!anyUser.length) {
    for (const u of [
      { email: 'admin@noochi.app', password: 'noochi-admin-42', name: 'Admin', role: 'admin' },
      { email: 'demo@noochi.app', password: 'noochi-demo-42', name: 'Demo', role: 'user' },
    ]) {
      const id = newId();
      await db.insert(users).values({ id, email: u.email, name: u.name, role: u.role, passwordHash: hashPassword(u.password) });
      await db.insert(subscriptions).values({ id: newId(), userId: id, planId: u.role === 'admin' ? 'pro' : 'free', status: 'active' });
      console.log(`[noochi:devstack] created ${u.email} / ${u.password}`);
    }
  }
  const anyChar = await db.select({ id: characters.id }).from(characters).limit(1);
  if (!anyChar.length) {
    for (const c of SEED_CHARACTERS) {
      await db.insert(characters).values({
        id: newId(), slug: c.slug, name: c.name, level: c.level, lang: 'en',
        tagline: c.tagline, emoji: c.emoji, gradient: c.gradient, persona: c.persona,
        interests: c.interests, style: c.style, formality: c.formality,
        welcome: c.welcome, isPublic: true, ownerId: null,
      });
    }
    console.log(`[noochi:devstack] seeded ${SEED_CHARACTERS.length} characters`);
  }
}

async function main() {
  const stack = await makeStack('standalone');
  const maps: HandlerMap[] = [
    authHandlers(stack), usersHandlers(stack), botsHandlers(stack), chatHandlers(stack),
    aiHandlers(stack), studyHandlers(stack), billingHandlers(stack), analyticsHandlers(stack),
  ];
  let count = 0;
  for (const map of maps) {
    for (const [subject, handler] of Object.entries(map)) {
      stack.bus.registerHandler(subject as SubjectName, handler!);
      count++;
    }
  }
  await ensureSeed(stack.db);
  const gw = await createGateway(stack);
  await gw.listen(stack.env.gatewayPort);
  console.log(`[noochi:devstack] all-in-one ready, ${count} subjects`);
}

main().catch((e) => { console.error(e); process.exit(1); });
