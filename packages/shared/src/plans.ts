export const PLAN_IDS = ['free', 'plus', 'pro'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export interface PlanLimits {
  messagesPerDay: number;
  explainsPerDay: number;
  studyItems: number;
  ownCharacters: number;
}

export interface PlanFeature {
  ownCharacters: boolean;
  analytics: 'none' | 'basic' | 'full';
  removeAdsBadge: boolean;
  priorityModels: boolean;
}

export interface PlanDef {
  id: PlanId;
  name: string;
  priceMonthlyUSD: number;
  tagline: string;
  limits: PlanLimits;
  features: PlanFeature;
}

export const PLANS: Record<PlanId, PlanDef> = {
  free: {
    id: 'free',
    name: 'Free',
    priceMonthlyUSD: 0,
    tagline: 'Попробовать и жить в языке понемногу',
    limits: { messagesPerDay: 30, explainsPerDay: 20, studyItems: 150, ownCharacters: 0 },
    features: { ownCharacters: false, analytics: 'none', removeAdsBadge: false, priorityModels: false },
  },
  plus: {
    id: 'plus',
    name: 'Plus',
    priceMonthlyUSD: 5,
    tagline: 'Для тех, кто занимается каждый день',
    limits: { messagesPerDay: 300, explainsPerDay: 100000, studyItems: 5000, ownCharacters: 5 },
    features: { ownCharacters: true, analytics: 'basic', removeAdsBadge: true, priorityModels: false },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceMonthlyUSD: 12,
    tagline: 'Максимум практики, своя вселенная персонажей',
    limits: { messagesPerDay: 2000, explainsPerDay: 100000, studyItems: 100000, ownCharacters: 50 },
    features: { ownCharacters: true, analytics: 'full', removeAdsBadge: true, priorityModels: true },
  },
};

export type FeatureKey = keyof PlanFeature;

export function isPlanId(v: string): v is PlanId {
  return (PLAN_IDS as readonly string[]).includes(v);
}
