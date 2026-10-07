import crypto from 'node:crypto';
import { SEED_CHARACTERS } from './seed-data.js';
import { eq } from 'drizzle-orm';
import { createDb, applyMigrations } from './client.js';
import { dbConfig } from './boot.js';
import { characters, users, subscriptions } from './schema.js';

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32);
  return `s1$${salt.toString('hex')}$${hash.toString('hex')}`;
}

const uid = () => crypto.randomUUID();


async function main() {
  const cfg = await dbConfig();
  const handle = createDb(cfg);
  await applyMigrations(handle);
  const { db } = handle;

  // users
  const emails = [
    { email: 'admin@noochi.app', password: 'noochi-admin-42', name: 'Admin', role: 'admin' as const },
    { email: 'demo@noochi.app', password: 'noochi-demo-42', name: 'Demo', role: 'user' as const },
  ];
  for (const u of emails) {
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, u.email)).limit(1);
    if (existing.length) { console.log(`user ${u.email} exists, skip`); continue; }
    const id = uid();
    await db.insert(users).values({ id, email: u.email, name: u.name, role: u.role, passwordHash: hashPassword(u.password) });
    await db.insert(subscriptions).values({ id: uid(), userId: id, planId: u.role === 'admin' ? 'pro' : 'free', status: 'active' });
    console.log(`created user ${u.email} (password ${u.password})`);
  }

  // characters — the seed owns these rows' prompt text, so re-seeding refreshes them in place
  let created = 0, refreshed = 0;
  for (const c of SEED_CHARACTERS) {
    const existing = await db.select({ id: characters.id }).from(characters).where(eq(characters.slug, c.slug)).limit(1);
    const prompt = {
      name: c.name, level: c.level, tagline: c.tagline, emoji: c.emoji, gradient: c.gradient,
      persona: c.persona, interests: c.interests, style: c.style, formality: c.formality, welcome: c.welcome,
    };
    if (existing.length) {
      await db.update(characters).set(prompt).where(eq(characters.id, existing[0].id));
      refreshed++;
      continue;
    }
    await db.insert(characters).values({
      id: uid(), slug: c.slug, lang: 'en', ...prompt,
      isPublic: true, ownerId: null,
    });
    created++;
  }
  console.log(`characters seeded: ${created} new, ${refreshed} refreshed`);
  await handle.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
