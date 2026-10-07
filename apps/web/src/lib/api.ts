export class ApiError extends Error {
  constructor(public code: string, message: string, public details?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

let tokenGetter: () => string | null = () => null;
export function setTokenGetter(fn: () => string | null) {
  tokenGetter = fn;
}

async function rpc<T>(path: string, body?: unknown): Promise<T> {
  const token = tokenGetter();
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = (json as { error?: { code: string; message: string; details?: unknown } })?.error;
    throw new ApiError(e?.code ?? 'INTERNAL', e?.message ?? `HTTP ${res.status}`, e?.details);
  }
  return json as T;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new ApiError('INTERNAL', `HTTP ${res.status}`);
  return (await res.json()) as T;
}

import type {
  AiExplainRes, AiCheckReq, AiCheckRes, AiTranslateRes, AnalyticsSummary, AuthTokens, Character,
  Conversation, ExplainRecord, Message,
  PlanDef, PlanStatus, PublicUser, StudyItem, AiSettingsView, AdminOverview,
  CefrLevel, StudyMeta, StudyKind,
} from '@noochi/shared';

export interface OpenChatRes {
  conversation: Conversation;
  character: Character;
  messages: Message[];
}

export const api = {
  plans: () => getJson<PlanDef[]>('/api/billing/plans'),

  register: (b: { email: string; password: string; name: string; nativeLang: string; targetLang: string }) =>
    rpc<{ user: PublicUser; tokens: AuthTokens }>('/api/auth/register', b),
  login: (b: { email: string; password: string }) =>
    rpc<{ user: PublicUser; tokens: AuthTokens }>('/api/auth/login', b),
  refresh: (refreshToken: string) => rpc<AuthTokens>('/api/auth/refresh', { refreshToken }),
  me: () => rpc<PublicUser>('/api/auth/me'),

  usersGet: () => rpc<{ user: PublicUser; ai: AiSettingsView }>('/api/users/get'),
  usersUpdate: (b: { name?: string; nativeLang?: string; targetLang?: string }) => rpc<PublicUser>('/api/users/update', b),
  setAi: (b: { apiKey?: string | null; model?: string; temperature?: number }) => rpc<AiSettingsView>('/api/users/set-ai', b),

  catalog: (f: { level?: CefrLevel; lang?: string } = {}) => rpc<Character[]>('/api/bots/catalog', f),
  createChar: (b: Partial<Character> & { persona: string; name: string; level: CefrLevel }) => rpc<Character>('/api/bots/create', b),
  updateChar: (b: Record<string, unknown>) => rpc<Character>('/api/bots/update', b),
  removeChar: (characterId: string) => rpc<{ ok: true }>('/api/bots/remove', { characterId }),

  conversations: () => rpc<{ conversations: Conversation[]; characters: Record<string, Character> }>('/api/chat/conversations'),
  openChat: (characterId: string) => rpc<OpenChatRes>('/api/chat/open', { characterId }),
  history: (conversationId: string, before?: string) => rpc<{ messages: Message[]; hasMore: boolean }>('/api/chat/history', { conversationId, before }),
  send: (conversationId: string, text: string, requestId: string) => rpc<{ userMessage: Message }>('/api/chat/send', { conversationId, text, requestId }),
  deleteChat: (conversationId: string) => rpc<{ ok: true }>('/api/chat/remove', { conversationId }),

  explain: (b: { text: string; context?: string; nativeLang: string; targetLang: string }) =>
    rpc<AiExplainRes>('/api/ai/explain', b),
  check: (b: Omit<AiCheckReq, 'userId'>) => rpc<AiCheckRes>('/api/ai/check', b),
  translate: (b: { text: string; nativeLang: string; targetLang: string; level?: string }) =>
    rpc<AiTranslateRes>('/api/ai/translate', b),
  explains: (f: { limit?: number } = {}) => rpc<ExplainRecord[]>('/api/ai/explains', f),
  explainRemove: (explainId: string) => rpc<{ ok: true }>('/api/ai/explain/remove', { explainId }),

  studyAdd: (b: { kind: StudyKind; term: string; translation?: string | null; meta?: StudyMeta }) => rpc<StudyItem>('/api/study/add', b),
  studyList: (f: { kind?: StudyKind; state?: StudyItem['state']; dueOnly?: boolean } = {}) => rpc<StudyItem[]>('/api/study/list', f),
  studyRemove: (itemId: string) => rpc<{ ok: true }>('/api/study/remove', { itemId }),
  studyReview: (itemId: string, grade: 'again' | 'hard' | 'good' | 'easy') => rpc<StudyItem>('/api/study/review', { itemId, grade }),

  billingStatus: () => rpc<PlanStatus>('/api/billing/status'),
  subscribe: (planId: string) => rpc<PlanStatus>('/api/billing/subscribe', { planId }),

  analyticsSummary: () => rpc<AnalyticsSummary>('/api/analytics/summary'),

  adminOverview: () => rpc<AdminOverview>('/api/admin/overview'),
  adminUsersList: (query: string, page: number) => rpc<{ items: PublicUser[]; total: number }>('/api/admin/users/list', { query, page }),
  adminUserUpdate: (b: { userId: string; role?: string; planId?: string; banned?: boolean }) => rpc<PublicUser>('/api/admin/users/update', b),
};

export const rid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
