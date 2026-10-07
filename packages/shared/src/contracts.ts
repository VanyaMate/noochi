import { z } from 'zod';
import { CEFR_LEVELS, type CefrLevel } from './levels.js';
import { PLANS, PLAN_IDS, type PlanId, type PlanFeature, type PlanLimits } from './plans.js';

export const zLevel = z.enum(CEFR_LEVELS);
export const zPlanId = z.enum(PLAN_IDS);
export const zLang = z.string().min(2).max(8); // 'en', 'ru', 'de', ...

// ---------- entities ----------
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  nativeLang: string;
  targetLang: string;
  planId: PlanId;
  banned: boolean;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AiSettingsView {
  model: string;
  hasUserKey: boolean;
  keyHint: string | null; // last 4 chars
  temperature: number;
}

export interface Character {
  id: string;
  slug: string;
  name: string;
  level: CefrLevel;
  lang: string;
  tagline: string;
  emoji: string;
  gradient: string; // tailwind gradient classes or css
  persona: string;
  interests: string[];
  style: string; // short description of speech style
  formality: 'casual' | 'neutral' | 'formal';
  welcome: string;
  extraPrompt: string | null;
  isPublic: boolean;
  ownerId: string | null;
  createdAt: string;
}

export interface Conversation {
  id: string;
  userId: string;
  characterId: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
}

export type Sender = 'user' | 'bot' | 'system';

export interface Message {
  id: string;
  conversationId: string;
  sender: Sender;
  characterId: string | null;
  text: string;
  /** Ties a streamed draft to the message it became — the client drops the draft on arrival. */
  requestId: string | null;
  /** Proofread result of the learner's own message; comes back with history so chips survive a reload. */
  check: AiCheckRes | null;
  createdAt: string;
}

export type StudyKind = 'word' | 'phrase' | 'grammar';

export interface StudyMeta {
  what?: string;
  why?: string;
  alternatives?: { word: string; note?: string }[];
  grammar?: string;
  example?: string;
  examples?: string[];
  /** the sentence the item was taken from, so a card can be remembered by its context */
  context?: string;
  level?: CefrLevel;
  sourceConversationId?: string;
  sourceMessageId?: string;
}

export interface StudyItem {
  id: string;
  userId: string;
  kind: StudyKind;
  term: string;
  translation: string | null;
  meta: StudyMeta;
  srsStep: number; // index into SRS_INTERVALS
  dueAt: string;
  state: 'new' | 'learning' | 'known';
  createdAt: string;
  updatedAt: string;
}

export interface UsageBucket {
  used: number;
  limit: number;
}

export interface PlanStatus {
  planId: PlanId;
  periodEnd: string | null;
  limits: PlanLimits;
  features: PlanFeature;
  usage: {
    messages: UsageBucket;
    explains: UsageBucket;
    studyItems: UsageBucket;
    ownCharacters: UsageBucket;
  };
}

export interface AiExplainRes {
  term: string;
  translation: string;
  ipa: string | null;
  pos: string | null;
  level: CefrLevel | null;
  /** what this word/form/rule is at all, in the native language */
  what: string;
  why: string;
  alternatives: { word: string; note: string }[];
  grammar: string | null;
  examples: string[];
}

export interface AnalyticsSummary {
  messagesByDay: { date: string; count: number }[];
  wordsTotal: number;
  wordsMature: number;
  reviewsByDay: { date: string; count: number }[];
  streakDays: number;
  activeDays: number;
  mostCorrected: { term: string; count: number }[];
}

export interface AdminOverview {
  users: number;
  bannedUsers: number;
  proUsers: number;
  plusUsers: number;
  messagesToday: number;
  conversations: number;
  characters: number;
  customCharacters: number;
  signupsLast7: { date: string; count: number }[];
}

// ---------- curated OpenRouter models ----------
export interface ModelInfo {
  id: string;
  label: string;
  note: string;
  goodFor: CefrLevel[];
}

export const OPENROUTER_MODELS: ModelInfo[] = [
  { id: 'google/gemini-2.0-flash-exp:free', label: 'Gemini 2 Flash (free)', note: 'Быстро, бесплатно, норм для A1–B1', goodFor: ['A1', 'A2', 'B1'] },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (free)', note: 'Свободная модель, живой язык', goodFor: ['A2', 'B1', 'B2'] },
  { id: 'deepseek/deepseek-chat-v3-0324:free', label: 'DeepSeek V3 (free)', note: 'Хорошо объясняет грамматику', goodFor: ['B1', 'B2', 'C1'] },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini', note: 'Дёшево и стабильно, любой уровень', goodFor: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] },
  { id: 'anthropic/claude-3.5-haiku', label: 'Claude 3.5 Haiku', note: 'Естественные короткие ответы', goodFor: ['A1', 'A2', 'B1', 'B2', 'C1'] },
  { id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5', note: 'Топ для C1–C2 и тонких объяснений', goodFor: ['B2', 'C1', 'C2'] },
];
export const DEFAULT_MODEL = 'openai/gpt-4o-mini';

// ---------- request schemas ----------
export const zRegister = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(80),
  nativeLang: zLang.default('ru'),
  targetLang: zLang.default('en'),
});
export type RegisterReq = z.infer<typeof zRegister>;

export const zLogin = z.object({ email: z.string().email(), password: z.string().min(1) });
export type LoginReq = z.infer<typeof zLogin>;

export const zRefresh = z.object({ refreshToken: z.string().min(10) });
export type RefreshReq = z.infer<typeof zRefresh>;

export const zUsersUpdate = z.object({
  userId: z.string().min(1),
  name: z.string().min(1).max(80).optional(),
  nativeLang: zLang.optional(),
  targetLang: zLang.optional(),
});
export type UsersUpdateReq = z.infer<typeof zUsersUpdate>;

export const zUsersSetAi = z.object({
  userId: z.string().min(1),
  apiKey: z.string().max(300).nullable().optional(), // null = remove
  model: z.string().min(1).max(120).optional(),
  temperature: z.number().min(0).max(1.5).optional(),
});
export type UsersSetAiReq = z.infer<typeof zUsersSetAi>;

export const zUsersAdminList = z.object({
  query: z.string().max(120).default(''),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type UsersAdminListReq = z.infer<typeof zUsersAdminList>;

export const zUsersAdminUpdate = z.object({
  userId: z.string().min(1),
  role: z.enum(['user', 'admin']).optional(),
  planId: zPlanId.optional(),
  banned: z.boolean().optional(),
});
export type UsersAdminUpdateReq = z.infer<typeof zUsersAdminUpdate>;

export const zBotsCatalog = z.object({
  userId: z.string().min(1),
  level: zLevel.optional(),
  lang: zLang.optional(),
});
export type BotsCatalogReq = z.infer<typeof zBotsCatalog>;

const zCharacterCore = z.object({
  name: z.string().min(1).max(60),
  level: zLevel,
  lang: zLang.default('en'),
  tagline: z.string().max(140).default(''),
  emoji: z.string().max(8).default('🦊'),
  gradient: z.string().max(80).default('from-amber-200 to-rose-300'),
  persona: z.string().min(10).max(2000),
  interests: z.array(z.string().max(60)).max(12).default([]),
  style: z.string().max(400).default(''),
  formality: z.enum(['casual', 'neutral', 'formal']).default('casual'),
  welcome: z.string().max(500).default(''),
  extraPrompt: z.string().max(2000).nullable().default(null),
});

export const zBotsCreate = zCharacterCore.extend({ userId: z.string().min(1) });
export type BotsCreateReq = z.infer<typeof zBotsCreate>;

export const zBotsUpdate = zCharacterCore.partial().extend({
  characterId: z.string().min(1),
  userId: z.string().min(1),
  isPublic: z.boolean().optional(),
});
export type BotsUpdateReq = z.infer<typeof zBotsUpdate>;

export const zChatOpen = z.object({ userId: z.string().min(1), characterId: z.string().min(1) });
export type ChatOpenReq = z.infer<typeof zChatOpen>;

export const zChatHistory = z.object({
  userId: z.string().min(1),
  conversationId: z.string().min(1),
  before: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ChatHistoryReq = z.infer<typeof zChatHistory>;

export const zChatSend = z.object({
  userId: z.string().min(1),
  conversationId: z.string().min(1),
  text: z.string().min(1).max(4000),
  requestId: z.string().min(6).max(64),
});
export type ChatSendReq = z.infer<typeof zChatSend>;

export const zChatDelete = z.object({ userId: z.string().min(1), conversationId: z.string().min(1) });
export type ChatDeleteReq = z.infer<typeof zChatDelete>;

export const zAiExplain = z.object({
  userId: z.string().min(1),
  text: z.string().min(1).max(800),
  context: z.string().max(2000).optional(),
  nativeLang: zLang,
  targetLang: zLang,
});
export type AiExplainReq = z.infer<typeof zAiExplain>;

export const CHECK_ISSUE_KINDS = ['grammar', 'spelling', 'word', 'punctuation', 'style'] as const;
export type CheckIssueKind = (typeof CHECK_ISSUE_KINDS)[number];

export const zAiCheck = z.object({
  userId: z.string().min(1),
  text: z.string().min(1).max(2000),
  level: zLevel.optional(),
  nativeLang: zLang,
  targetLang: zLang,
});
export type AiCheckReq = z.infer<typeof zAiCheck>;

export interface CheckIssue {
  quote: string;
  correction: string;
  note: string;
  kind: CheckIssueKind;
}

export interface AiCheckRes {
  ok: boolean;
  issues: CheckIssue[];
  summary: string;
  polished: string | null;
}

/** Ask the AI to write the learner's own words in the language of the chat. */
export const zAiTranslate = z.object({
  userId: z.string().min(1),
  text: z.string().min(1).max(2000),
  nativeLang: zLang,
  targetLang: zLang,
  level: zLevel.optional(),
});
export type AiTranslateReq = z.infer<typeof zAiTranslate>;

export interface AiTranslateRes {
  translation: string;
  /** Short hint about word choice / how it sounds, in the native language. */
  note: string;
}

/** A saved breakdown of a selected piece of text (page «Разборы»). */
export interface ExplainRecord {
  id: string;
  term: string;
  context: string | null;
  nativeLang: string;
  targetLang: string;
  result: AiExplainRes;
  createdAt: string;
}

export const zAiExplainList = z.object({
  userId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(200).default(60),
  before: z.string().datetime({ offset: true }).optional(),
});
export type AiExplainListReq = z.infer<typeof zAiExplainList>;

export const zAiExplainRemove = z.object({ userId: z.string().min(1), explainId: z.string().min(1) });
export type AiExplainRemoveReq = z.infer<typeof zAiExplainRemove>;

export const zStudyAdd = z.object({
  userId: z.string().min(1),
  kind: z.enum(['word', 'phrase', 'grammar']),
  term: z.string().min(1).max(200),
  translation: z.string().max(500).nullable().default(null),
  meta: z.object({
    why: z.string().max(2000).optional(),
    alternatives: z.array(z.object({ word: z.string().max(80), note: z.string().max(200).optional() })).optional(),
    grammar: z.string().max(2000).optional(),
    example: z.string().max(500).optional(),
    level: zLevel.optional(),
    sourceConversationId: z.string().optional(),
    sourceMessageId: z.string().optional(),
  }).default({}),
});
export type StudyAddReq = z.infer<typeof zStudyAdd>;

export const zStudyList = z.object({
  userId: z.string().min(1),
  kind: z.enum(['word', 'phrase', 'grammar']).optional(),
  state: z.enum(['new', 'learning', 'known']).optional(),
  dueOnly: z.boolean().default(false),
});
export type StudyListReq = z.infer<typeof zStudyList>;

export const zStudyRemove = z.object({ userId: z.string().min(1), itemId: z.string().min(1) });
export type StudyRemoveReq = z.infer<typeof zStudyRemove>;

export const zStudyReview = z.object({
  userId: z.string().min(1),
  itemId: z.string().min(1),
  grade: z.enum(['again', 'hard', 'good', 'easy']),
});
export type StudyReviewReq = z.infer<typeof zStudyReview>;

export const SRS_INTERVALS_DAYS = [0, 1, 3, 7, 16, 35, 60] as const;

// internal service-to-service (chat → ai)
export interface AiReplyReq {
  userId: string;
  characterId: string;
  conversationId: string;
  requestId: string;
  text: string;
  history: { sender: Sender; text: string }[];
  userLevel?: CefrLevel;
  nativeLang: string;
  targetLang: string;
}

export const zBillingSubscribe = z.object({
  userId: z.string().min(1),
  planId: zPlanId.refine((p) => p !== 'free', 'use cancel for free'),
});
export type BillingSubscribeReq = z.infer<typeof zBillingSubscribe>;

export const zBillingCheck = z.object({
  userId: z.string().min(1),
  feature: z.enum(['ownCharacters', 'analytics', 'priorityModels', 'removeAdsBadge']),
});
export type BillingCheckReq = z.infer<typeof zBillingCheck>;

export { PLANS, PLAN_IDS };
export type { PlanId, PlanFeature, PlanLimits, CefrLevel };
