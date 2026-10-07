import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { OPENROUTER_MODELS, type PlanStatus } from '@noochi/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n, useT, type LangKey } from '../lib/i18n';
import { sounds } from '../lib/sound';
import { LANG_LIST, langName } from '../lib/langs';
import { Spinner } from '../components/ui';
import { reportApiError } from '../App';
import { useToasts } from '../lib/toasts';

export default function ProfilePage() {
  const t = useT();
  const qc = useQueryClient();
  const { user, setUser } = useAuth();
  const push = useToasts((s) => s.push);
  const lang = useI18n((s) => s.lang);
  const setLang = useI18n((s) => s.setLang);

  const { data: me } = useQuery({ queryKey: ['usersGet'], queryFn: () => api.usersGet() });
  const { data: plan } = useQuery({ queryKey: ['billingStatus'], queryFn: () => api.billingStatus() });

  const [name, setName] = useState('');
  const [nativeLang, setNativeLang] = useState('ru');
  const [targetLang, setTargetLang] = useState('en');
  useEffect(() => {
    if (me) {
      setName(me.user.name);
      setNativeLang(me.user.nativeLang);
      setTargetLang(me.user.targetLang);
    }
  }, [me]);

  const saveProfile = useMutation({
    mutationFn: () => api.usersUpdate({ name, nativeLang, targetLang }),
    onSuccess: (u) => { setUser(u); push(t('saved'), 'ok'); qc.invalidateQueries({ queryKey: ['usersGet'] }); },
    onError: reportApiError,
  });

  const [keyInput, setKeyInput] = useState('');
  const [model, setModel] = useState('');
  const [temp, setTemp] = useState(0.8);
  useEffect(() => {
    if (me?.ai) { setModel(me.ai.model); setTemp(me.ai.temperature); }
  }, [me]);

  const saveAi = useMutation({
    mutationFn: (opts: { apiKey?: string | null }) =>
      api.setAi({ ...(opts.apiKey !== undefined ? { apiKey: opts.apiKey } : {}), model, temperature: temp }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usersGet'] });
      push(t('api_key_saved'), 'ok'); sounds.chime();
    },
    onError: reportApiError,
  });

  const [soundOn, setSoundOn] = useState(sounds.isEnabled());

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-extrabold">{t('profile_title')}</h1>

        <section className="card p-5">
          <h3 className="mb-3 font-extrabold">{t('name')} · {user?.email}</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm font-semibold text-cocoaSoft">{t('name')}
              <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="text-sm font-semibold text-cocoaSoft">{t('native_lang')}
              <select className="input mt-1" value={nativeLang} onChange={(e) => setNativeLang(e.target.value)}>
                {LANG_LIST.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold text-cocoaSoft">{t('target_lang')}
              <select className="input mt-1" value={targetLang} onChange={(e) => setTargetLang(e.target.value)}>
                {LANG_LIST.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
          <button className="btn-primary mt-3" disabled={!name.trim() || saveProfile.isPending} onClick={() => saveProfile.mutate()}>
            {saveProfile.isPending ? <Spinner size={16} /> : t('save')}
          </button>
        </section>

        <section className="card min-h-[360px] p-5">
          <h3 className="mb-1 font-extrabold">🧠 {t('ai_title')} {!me && <Spinner size={14} />}</h3>
          <p className="mb-3 text-xs text-cocoaSoft">{t('api_key_hint')}</p>
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-cocoaSoft">{t('api_key')}
              <div className="mt-1 flex gap-2">
                <input
                  className="input" type="password" autoComplete="off"
                  placeholder={me?.ai.hasUserKey ? `••••••••${me.ai.keyHint ?? ''}` : 'sk-or-v1-…'}
                  value={keyInput} onChange={(e) => setKeyInput(e.target.value)}
                />
                {me?.ai.hasUserKey && (
                  <button className="btn-ghost shrink-0 text-sm" onClick={() => saveAi.mutate({ apiKey: null })}>{t('api_key_remove')}</button>
                )}
              </div>
            </label>
            <label className="block text-sm font-semibold text-cocoaSoft">{t('model')}
              <input
                className="input mt-1" list="noochi-models" value={model} maxLength={120}
                placeholder="google/gemini-2.0-flash-exp:free"
                onChange={(e) => setModel(e.target.value)}
              />
              <datalist id="noochi-models">
                {OPENROUTER_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label} — {m.note}</option>
                ))}
              </datalist>
              <span className="mt-1 block text-xs font-normal text-cocoaSoft/80">{t('model_hint')}</span>
            </label>
            <label className="block text-sm font-semibold text-cocoaSoft">
              {t('temperature')}: <span className="text-terraDeep">{temp.toFixed(2)}</span>
              <input type="range" min={0} max={1.5} step={0.05} value={temp}
                onChange={(e) => setTemp(Number(e.target.value))} className="mt-1 w-full accent-terra" />
              <span className="mt-1 block text-xs font-normal leading-relaxed text-cocoaSoft/80">{t('temperature_hint')}</span>
            </label>
            <button className="btn-primary" disabled={saveAi.isPending || !me || !model.trim()}
              onClick={() => saveAi.mutate(keyInput.trim() ? { apiKey: keyInput.trim() } : {})}>
              {saveAi.isPending ? <Spinner size={16} /> : t('save')}
            </button>
          </div>
        </section>

        <PlanUsage plan={plan} />

        <section className="card p-5">
          <h3 className="mb-3 font-extrabold">🎛️ {t('ui_settings')}</h3>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1">
              {(['ru', 'en'] as LangKey[]).map((l) => (
                <button key={l} onClick={() => setLang(l)}
                  className={`chip transition ${lang === l ? 'bg-dusk text-cream' : 'bg-latte text-cocoaSoft'}`}>{langName(l)}</button>
              ))}
            </div>
            <button className={`chip ${soundOn ? 'bg-sage/30 text-sageDeep' : 'bg-latte text-cocoaSoft'}`}
              onClick={() => { const v = !soundOn; sounds.setEnabled(v); setSoundOn(v); }}>
              {soundOn ? `🔔 ${t('sound_on')}` : `🔕 ${t('sound_off')}`}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function PlanUsage({ plan }: { plan?: PlanStatus }) {
  const t = useT();
  if (!plan) return <section className="card p-5"><Spinner /></section>;
  const rows = [
    { label: t('today_messages'), u: plan.usage.messages },
    { label: t('today_explains'), u: plan.usage.explains },
    { label: t('study_items'), u: plan.usage.studyItems },
    { label: t('my_chars'), u: plan.usage.ownCharacters },
  ];
  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-extrabold">✨ {t('plan_title')}: <NavLink to="/plans" className="text-terraDeep hover:underline">{plan.planId}</NavLink></h3>
        <NavLink to="/plans" className="btn-ghost text-sm">{t('plans_title')} →</NavLink>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="mb-1 flex justify-between text-xs font-bold text-cocoaSoft">
              <span>{r.label}</span><span>{r.u.used}{r.u.limit > 9000 ? '' : `/${r.u.limit}`}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-latte/70">
              <div className="h-full rounded-full bg-gradient-to-r from-honey to-terra transition-all"
                style={{ width: `${r.u.limit > 0 ? Math.min(100, (r.u.used / r.u.limit) * 100) : 4}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
