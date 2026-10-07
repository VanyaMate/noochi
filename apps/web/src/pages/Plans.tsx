import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { PlanDef, PlanId } from '@noochi/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useT } from '../lib/i18n';
import { Spinner } from '../components/ui';
import { reportApiError } from '../App';
import { useToasts } from '../lib/toasts';
import { sounds } from '../lib/sound';

export default function PlansPage() {
  const t = useT();
  const qc = useQueryClient();
  const nav = useNavigate();
  const { user, setUser } = useAuth();
  const push = useToasts((s) => s.push);
  const [plans, setPlans] = useState<PlanDef[] | null>(null);

  useQuery({
    queryKey: ['plans'],
    queryFn: async () => {
      const p = await api.plans();
      setPlans(p);
      return p;
    },
  });
  const { data: status } = useQuery({ queryKey: ['billingStatus'], queryFn: () => api.billingStatus() });

  const sub = useMutation({
    mutationFn: (planId: PlanId) => api.subscribe(planId),
    onSuccess: (s) => {
      sounds.chime();
      push(`✨ ${s.planId}`, 'ok');
      if (user) setUser({ ...user, planId: s.planId });
      qc.invalidateQueries({ queryKey: ['billingStatus'] });
    },
    onError: reportApiError,
  });

  if (!plans) return <div className="grid h-full place-items-center"><Spinner size={26} /></div>;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-extrabold">{t('plans_title')}</h1>
        <p className="mb-6 text-sm text-cocoaSoft">{t('current')}: <b className="text-terraDeep">{status?.planId ?? user?.planId}</b></p>

        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((p, i) => {
            const current = (status?.planId ?? user?.planId) === p.id;
            const hi = p.id === 'pro';
            return (
              <div key={p.id} className={`card animate-rise relative flex flex-col p-5 ${current ? 'ring-2 ring-terra/60' : ''}`}
                style={{ animationDelay: `${i * 70}ms` }}>
                {hi && <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-honey to-terra px-3 py-0.5 text-[11px] font-extrabold text-parchment shadow-soft">{t('popular')}</span>}
                <h3 className="text-lg font-extrabold">{p.name}</h3>
                <p className="mb-2 text-sm text-cocoaSoft">{p.tagline}</p>
                <div className="mb-4">
                  <span className="text-3xl font-extrabold">${p.priceMonthlyUSD}</span>
                  <span className="text-sm text-cocoaSoft"> {t('per_month')}</span>
                </div>
                <ul className="mb-5 flex-1 space-y-1.5 text-sm">
                  <li>💬 {p.limits.messagesPerDay} {t('today_messages').toLowerCase()}</li>
                  <li>🔎 {p.limits.explainsPerDay} {t('today_explains').toLowerCase()}</li>
                  <li>🌱 {p.limits.studyItems} {t('study_items').toLowerCase()}</li>
                  <li>🦊 {p.features.ownCharacters ? `${p.limits.ownCharacters} ${t('my_chars').toLowerCase()}` : `— ${t('create_char').toLowerCase()}`}</li>
                  <li>📊 {p.features.analytics === 'full' ? t('analytics_full') : p.features.analytics === 'basic' ? t('analytics_basic') : '—'}</li>
                </ul>
                {current ? (
                  <button className="btn w-full bg-latte text-cocoaSoft" disabled>{t('current')}</button>
                ) : (
                  <button className={`btn w-full ${hi ? 'btn-primary' : 'btn-warm'}`} disabled={sub.isPending}
                    onClick={() => sub.mutate(p.id)}>
                    {sub.isPending ? <Spinner size={16} /> : p.id === 'free' ? t('choose') : t('subscribe_demo')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-center text-xs text-cocoaSoft/70">
          {t('plans_demo_note')} <button className="underline" onClick={() => nav('/profile')}>{t('nav_profile')}</button>
        </p>
      </div>
    </div>
  );
}
