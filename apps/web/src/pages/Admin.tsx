import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PlanId, PublicUser } from '@noochi/shared';
import { api } from '../lib/api';
import { useT } from '../lib/i18n';
import { Spinner } from '../components/ui';
import { reportApiError } from '../App';

export default function AdminPage() {
  const t = useT();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'overview' | 'users'>('overview');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const { data: ov } = useQuery({ queryKey: ['adminOverview'], queryFn: () => api.adminOverview() });
  const { data: users, isLoading } = useQuery({
    queryKey: ['adminUsers', query, page],
    queryFn: () => api.adminUsersList(query, page),
    enabled: tab === 'users',
  });

  const upd = useMutation({
    mutationFn: (b: { userId: string; role?: string; planId?: PlanId; banned?: boolean }) => api.adminUserUpdate(b),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminUsers'] });
      qc.invalidateQueries({ queryKey: ['adminOverview'] });
    },
    onError: reportApiError,
  });

  const maxSignups = Math.max(1, ...(ov?.signupsLast7.map((d) => d.count) ?? [1]));

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-4 text-2xl font-extrabold">🛠️ {t('admin_title')}</h1>
        <div className="mb-4 flex gap-1.5">
          {(['overview', 'users'] as const).map((k) => (
            <button key={k} onClick={() => setTab(k)}
              className={`chip transition ${tab === k ? 'bg-dusk text-cream' : 'bg-parchment text-cocoaSoft hover:bg-latte'}`}>
              {k === 'overview' ? '📊' : `👥 ${t('admin_users')}`}
            </button>
          ))}
        </div>

        {tab === 'overview' && (!ov ? <Spinner size={26} /> : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { l: 'users', v: ov.users, i: '👥' },
                { l: 'banned', v: ov.bannedUsers, i: '🚫' },
                { l: 'plus', v: ov.plusUsers, i: '✨' },
                { l: 'pro', v: ov.proUsers, i: '💎' },
                { l: 'msg today', v: ov.messagesToday, i: '💬' },
                { l: 'chats', v: ov.conversations, i: '🗨️' },
                { l: 'characters', v: ov.characters, i: '🦊' },
                { l: 'custom', v: ov.customCharacters, i: '🎨' },
              ].map((s, i) => (
                <div key={s.l} className="card animate-rise p-4" style={{ animationDelay: `${i * 40}ms` }}>
                  <div className="text-2xl font-extrabold">{s.v}</div>
                  <div className="text-xs font-bold uppercase tracking-wide text-cocoaSoft/80">{s.i} {s.l}</div>
                </div>
              ))}
            </div>
            <div className="card p-5">
              <h3 className="mb-3 font-extrabold">signups · 7 days</h3>
              <div className="flex h-28 items-end gap-2">
                {ov.signupsLast7.map((d) => (
                  <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                    <div className="w-full rounded-t-lg bg-gradient-to-t from-honey/60 to-terra/80 transition-all hover:from-honey"
                      style={{ height: `${(d.count / maxSignups) * 90 + 4}%` }} title={String(d.count)} />
                    <span className="text-[10px] text-cocoaSoft">{new Date(d.date).toLocaleDateString(undefined, { weekday: 'short' })}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}

        {tab === 'users' && (
          <div>
            <div className="mb-3 flex items-center gap-2">
              <input className="input max-w-xs" placeholder={t('admin_search')} value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
              <span className="text-xs text-cocoaSoft">{users ? `total: ${users.total}` : ''}</span>
            </div>
            {isLoading ? <Spinner /> : (
              <>
                <div className="card divide-y divide-latte/60 overflow-hidden">
                  {users?.items.map((u: PublicUser) => (
                    <div key={u.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <b className="truncate">{u.name}</b>
                          <span className={`chip ${u.planId === 'pro' ? 'bg-terra/20 text-terraDeep' : u.planId === 'plus' ? 'bg-sage/25 text-sageDeep' : 'bg-latte text-cocoaSoft'}`}>{u.planId}</span>
                          {u.role === 'admin' && <span className="chip bg-dusk text-cream">admin</span>}
                          {u.banned && <span className="chip bg-terraDeep text-parchment">banned</span>}
                        </div>
                        <div className="truncate text-xs text-cocoaSoft">{u.email} · {new Date(u.createdAt).toLocaleDateString()}</div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {(['free', 'plus', 'pro'] as PlanId[]).map((p) => (
                          <button key={p} disabled={u.planId === p || upd.isPending}
                            className={`chip ${u.planId === p ? 'bg-dusk text-cream' : 'bg-parchment text-cocoaSoft hover:bg-latte'}`}
                            onClick={() => upd.mutate({ userId: u.id, planId: p })}>{p}</button>
                        ))}
                        <button className="btn-ghost text-xs" onClick={() => upd.mutate({ userId: u.id, role: u.role === 'admin' ? 'user' : 'admin' })}>
                          {u.role === 'admin' ? t('make_user') : t('make_admin')}
                        </button>
                        <button className={`btn-ghost text-xs ${u.banned ? 'text-sageDeep' : 'text-terraDeep'}`}
                          onClick={() => upd.mutate({ userId: u.id, banned: !u.banned })}>
                          {u.banned ? t('unban') : t('ban')}
                        </button>
                      </div>
                    </div>
                  ))}
                  {!users?.items.length && <p className="p-8 text-center text-cocoaSoft">—</p>}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button className="btn-ghost text-sm" disabled={page === 1} onClick={() => setPage(page - 1)}>←</button>
                  <span className="text-sm text-cocoaSoft">{page}</span>
                  <button className="btn-ghost text-sm" disabled={!users || page * 25 >= users.total} onClick={() => setPage(page + 1)}>→</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
