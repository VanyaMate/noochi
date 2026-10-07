import {
  pgTable, text, timestamp, boolean, integer, jsonb, uniqueIndex, index,
} from 'drizzle-orm/pg-core';

const now = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  role: text('role').notNull().default('user'), // 'user' | 'admin'
  nativeLang: text('native_lang').notNull().default('ru'),
  targetLang: text('target_lang').notNull().default('en'),
  banned: boolean('banned').notNull().default(false),
  createdAt: now('created_at'),
  updatedAt: now('updated_at'),
}, (t) => [
  uniqueIndex('users_email_idx').on(t.email),
]);

export const refreshTokens = pgTable('refresh_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: now('created_at'),
}, (t) => [
  uniqueIndex('refresh_hash_idx').on(t.tokenHash),
  index('refresh_user_idx').on(t.userId),
]);

export const userAiSettings = pgTable('user_ai_settings', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  model: text('model').notNull().default('openai/gpt-4o-mini'),
  temperature: integer('temperature').notNull().default(70), // x100
  apiKeyEnc: text('api_key_enc'), // AES-256-GCM ciphertext (iv:tag:data hex)
  updatedAt: now('updated_at'),
});

export const characters = pgTable('characters', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  level: text('level').notNull(), // CefrLevel
  lang: text('lang').notNull().default('en'),
  tagline: text('tagline').notNull().default(''),
  emoji: text('emoji').notNull().default('🦊'),
  gradient: text('gradient').notNull().default('from-amber-200 to-rose-300'),
  persona: text('persona').notNull(),
  interests: jsonb('interests').notNull().$type<string[]>().default([]),
  style: text('style').notNull().default(''),
  formality: text('formality').notNull().default('casual'),
  welcome: text('welcome').notNull().default('Hi!'),
  extraPrompt: text('extra_prompt'),
  isPublic: boolean('is_public').notNull().default(true),
  ownerId: text('owner_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: now('created_at'),
  updatedAt: now('updated_at'),
}, (t) => [
  uniqueIndex('characters_slug_idx').on(t.slug),
  index('characters_level_idx').on(t.level),
]);

export const conversations = pgTable('conversations', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  characterId: text('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  createdAt: now('created_at'),
  updatedAt: now('updated_at'),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('conv_user_char_idx').on(t.userId, t.characterId),
]);

export const messages = pgTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  sender: text('sender').notNull(), // 'user' | 'bot' | 'system'
  characterId: text('character_id'),
  text: text('text').notNull(),
  requestId: text('request_id'),
  /** Proofread result for the learner's own message, produced together with the character reply. */
  check: jsonb('check').$type<import('@noochi/shared').AiCheckRes | null>(),
  createdAt: now('created_at'),
}, (t) => [
  index('messages_conv_idx').on(t.conversationId, t.createdAt),
]);

export const explains = pgTable('explains', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  term: text('term').notNull(),
  context: text('context'),
  nativeLang: text('native_lang').notNull().default('ru'),
  targetLang: text('target_lang').notNull().default('en'),
  result: jsonb('result').notNull().$type<import('@noochi/shared').AiExplainRes>(),
  createdAt: now('created_at'),
}, (t) => [
  index('explains_user_idx').on(t.userId, t.createdAt),
]);

export const studyItems = pgTable('study_items', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(), // 'word' | 'phrase' | 'grammar'
  term: text('term').notNull(),
  translation: text('translation'),
  meta: jsonb('meta').notNull().$type<import('@noochi/shared').StudyMeta>().default({}),
  srsStep: integer('srs_step').notNull().default(0),
  dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
  state: text('state').notNull().default('new'), // new | learning | known
  createdAt: now('created_at'),
  updatedAt: now('updated_at'),
}, (t) => [
  uniqueIndex('study_user_term_idx').on(t.userId, t.kind, t.term),
  index('study_due_idx').on(t.userId, t.dueAt),
]);

export const subscriptions = pgTable('subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  planId: text('plan_id').notNull(), // 'free' | 'plus' | 'pro'
  status: text('status').notNull().default('active'), // active | canceled
  startedAt: now('started_at'),
  periodEnd: timestamp('period_end', { withTimezone: true }),
}, (t) => [
  uniqueIndex('subs_user_idx').on(t.userId),
]);

export const planDefs = pgTable('plan_defs', {
  id: text('id').primaryKey(), // 'free' | 'plus' | 'pro'
  name: text('name').notNull(),
  tagline: text('tagline').notNull().default(''),
  priceMonthlyUsd: integer('price_monthly_usd').notNull().default(0),
  limits: jsonb('limits').notNull(),
  features: jsonb('features').notNull(),
  updatedAt: now('updated_at'),
});

export type UserRow = typeof users.$inferSelect;
export type CharacterRow = typeof characters.$inferSelect;
export type ConversationRow = typeof conversations.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type StudyItemRow = typeof studyItems.$inferSelect;
export type SubscriptionRow = typeof subscriptions.$inferSelect;
