import type { z } from 'zod';
import {
  zLogin, zRegister, zRefresh, type LoginReq, type RegisterReq, type RefreshReq,
  type AuthTokens, type PublicUser,
  zUsersUpdate, zUsersSetAi, zUsersAdminList, zUsersAdminUpdate,
  type UsersUpdateReq, type UsersSetAiReq, type UsersAdminListReq, type UsersAdminUpdateReq,
  type AiSettingsView,
  zBotsCatalog, zBotsCreate, zBotsUpdate,
  type BotsCatalogReq, type BotsCreateReq, type BotsUpdateReq,
  type Character,
  zChatOpen, zChatHistory, zChatSend, zChatDelete,
  type ChatOpenReq, type ChatHistoryReq, type ChatSendReq, type ChatDeleteReq,
  type Conversation, type Message,
  zAiExplain, zAiExplainList, zAiExplainRemove, zAiTranslate, zAiCheck,
  type AiExplainReq, type AiExplainRes, type AiReplyReq,
  type AiExplainListReq, type AiExplainRemoveReq,
  type AiCheckReq, type AiCheckRes,
  type AiTranslateReq, type AiTranslateRes, type ExplainRecord,
  zStudyAdd, zStudyList, zStudyRemove, zStudyReview,
  type StudyAddReq, type StudyListReq, type StudyRemoveReq, type StudyReviewReq,
  type StudyItem,
  zBillingSubscribe, zBillingCheck, type BillingSubscribeReq, type BillingCheckReq,
  type PlanStatus,
  type AnalyticsSummary, type AdminOverview,
} from './contracts.js';

export const S = {
  auth: {
    register: 'svc.auth.register',
    login: 'svc.auth.login',
    refresh: 'svc.auth.refresh',
    me: 'svc.auth.me',
  },
  users: {
    get: 'svc.users.get',
    update: 'svc.users.update',
    setAi: 'svc.users.set_ai',
    adminList: 'svc.users.admin_list',
    adminUpdate: 'svc.users.admin_update',
  },
  bots: {
    catalog: 'svc.bots.catalog',
    get: 'svc.bots.get',
    create: 'svc.bots.create',
    update: 'svc.bots.update',
    remove: 'svc.bots.remove',
  },
  chat: {
    conversations: 'svc.chat.conversations',
    open: 'svc.chat.open',
    history: 'svc.chat.history',
    send: 'svc.chat.send',
    remove: 'svc.chat.remove',
  },
  ai: {
    explain: 'svc.ai.explain',
    reply: 'svc.ai.reply',
    check: 'svc.ai.check',
    translate: 'svc.ai.translate',
    explainList: 'svc.ai.explain_list',
    explainRemove: 'svc.ai.explain_remove',
  },
  study: {
    add: 'svc.study.add',
    list: 'svc.study.list',
    remove: 'svc.study.remove',
    review: 'svc.study.review',
  },
  billing: {
    status: 'svc.billing.status',
    subscribe: 'svc.billing.subscribe',
    check: 'svc.billing.check',
    increment: 'svc.billing.increment',
  },
  analytics: {
    summary: 'svc.analytics.summary',
    adminOverview: 'svc.analytics.admin_overview',
  },
} as const;

export type SubjectKey = typeof S;

export interface Envelope<TReq = unknown, TRes = unknown> {
  req: z.ZodType<TReq>;
  res?: TRes;
}

/** Typed contract for every service subject: request schema + response type. */
export interface Contracts {
  'svc.auth.register': { req: RegisterReq; res: { user: PublicUser; tokens: AuthTokens } };
  'svc.auth.login': { req: LoginReq; res: { user: PublicUser; tokens: AuthTokens } };
  'svc.auth.refresh': { req: RefreshReq; res: AuthTokens };
  'svc.auth.me': { req: { userId: string }; res: PublicUser };

  'svc.users.get': { req: { userId: string }; res: { user: PublicUser; ai: AiSettingsView } };
  'svc.users.update': { req: UsersUpdateReq; res: PublicUser };
  'svc.users.set_ai': { req: UsersSetAiReq; res: AiSettingsView };
  'svc.users.admin_list': { req: UsersAdminListReq; res: { items: PublicUser[]; total: number } };
  'svc.users.admin_update': { req: UsersAdminUpdateReq; res: PublicUser };

  'svc.bots.catalog': { req: BotsCatalogReq; res: Character[] };
  'svc.bots.get': { req: { characterId: string }; res: Character };
  'svc.bots.create': { req: BotsCreateReq; res: Character };
  'svc.bots.update': { req: BotsUpdateReq; res: Character };
  'svc.bots.remove': { req: { characterId: string; userId: string }; res: { ok: true } };

  'svc.chat.conversations': { req: { userId: string }; res: { conversations: Conversation[]; characters: Record<string, Character> } };
  'svc.chat.open': { req: ChatOpenReq; res: { conversation: Conversation; character: Character; messages: Message[] } };
  'svc.chat.history': { req: ChatHistoryReq; res: { messages: Message[]; hasMore: boolean } };
  'svc.chat.send': { req: ChatSendReq; res: { userMessage: Message } };
  'svc.chat.remove': { req: ChatDeleteReq; res: { ok: true } };

  'svc.ai.explain': { req: AiExplainReq; res: AiExplainRes };
  'svc.ai.reply': { req: AiReplyReq; res: { text: string; check: AiCheckRes | null } };
  'svc.ai.check': { req: AiCheckReq; res: AiCheckRes };
  'svc.ai.translate': { req: AiTranslateReq; res: AiTranslateRes };
  'svc.ai.explain_list': { req: AiExplainListReq; res: ExplainRecord[] };
  'svc.ai.explain_remove': { req: AiExplainRemoveReq; res: { ok: true } };

  'svc.study.add': { req: StudyAddReq; res: StudyItem };
  'svc.study.list': { req: StudyListReq; res: StudyItem[] };
  'svc.study.remove': { req: StudyRemoveReq; res: { ok: true } };
  'svc.study.review': { req: StudyReviewReq; res: StudyItem };

  'svc.billing.status': { req: { userId: string }; res: PlanStatus };
  'svc.billing.plans': { req: Record<string, never>; res: unknown };
  'svc.billing.subscribe': { req: BillingSubscribeReq; res: PlanStatus };
  'svc.billing.check': { req: BillingCheckReq; res: { allowed: boolean } };
  'svc.billing.increment': { req: { userId: string; kind: 'messages' | 'explains' }; res: { used: number; limit: number } };

  'svc.analytics.summary': { req: { userId: string }; res: AnalyticsSummary };
  'svc.analytics.admin_overview': { req: Record<string, never>; res: AdminOverview };
}

export type SubjectName = keyof Contracts;
export type ReqOf<K extends SubjectName> = Contracts[K]['req'];
export type ResOf<K extends SubjectName> = Contracts[K]['res'];

/** Subjects that need request validation; others accept plain objects. */
export const REQ_VALIDATORS: Partial<Record<SubjectName, z.ZodTypeAny>> = {
  [S.auth.register]: zRegister,
  [S.auth.login]: zLogin,
  [S.auth.refresh]: zRefresh,
  [S.users.update]: zUsersUpdate,
  [S.users.setAi]: zUsersSetAi,
  [S.users.adminList]: zUsersAdminList,
  [S.users.adminUpdate]: zUsersAdminUpdate,
  [S.bots.catalog]: zBotsCatalog,
  [S.bots.create]: zBotsCreate,
  [S.bots.update]: zBotsUpdate,
  [S.chat.open]: zChatOpen,
  [S.chat.history]: zChatHistory,
  [S.chat.send]: zChatSend,
  [S.chat.remove]: zChatDelete,
  [S.ai.explain]: zAiExplain,
  [S.ai.check]: zAiCheck,
  [S.ai.translate]: zAiTranslate,
  [S.ai.explainList]: zAiExplainList,
  [S.ai.explainRemove]: zAiExplainRemove,
  [S.study.add]: zStudyAdd,
  [S.study.list]: zStudyList,
  [S.study.remove]: zStudyRemove,
  [S.study.review]: zStudyReview,
  [S.billing.subscribe]: zBillingSubscribe,
  [S.billing.check]: zBillingCheck,
};

export type ChatEvent =
  | { type: 'message'; conversationId: string; message: Message }
  | { type: 'stream_delta'; conversationId: string; requestId: string; characterId: string; delta: string; done: boolean }
  | { type: 'typing'; conversationId: string; characterId: string; on: boolean }
  | { type: 'check'; conversationId: string; messageId: string; status: 'pending' | 'done' | 'failed'; result?: AiCheckRes };

export const EVT = {
  chatTopic: (conversationId: string) => `evt.chat.${conversationId}`,
  userTopic: (userId: string) => `evt.user.${userId}.notify`,
  registered: 'evt.user.registered',
  planChanged: 'evt.billing.plan_changed',
} as const;
