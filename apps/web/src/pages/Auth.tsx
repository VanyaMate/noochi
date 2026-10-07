import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { useT } from '../lib/i18n';
import { Spinner } from '../components/ui';
import { LANG_LIST as LANG_OPTIONS } from '../lib/langs';

export default function AuthPage() {
  const t = useT();
  const nav = useNavigate();
  const signIn = useAuth((s) => s.signIn);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ email: '', password: '', name: '', nativeLang: 'ru', targetLang: 'en' });

  const f = (k: keyof typeof form) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value }),
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const res = mode === 'login'
        ? await api.login({ email: form.email, password: form.password })
        : await api.register(form);
      signIn(res.tokens, res.user);
      nav('/chats', { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Oops');
    } finally { setBusy(false); }
  }

  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl border border-latte shadow-lift md:grid-cols-2">
        <div className="hidden bg-gradient-to-br from-honey/55 via-terra/28 to-terraDeep/25 p-8 md:block">
          <div className="text-5xl">🦉</div>
          <h1 className="mt-3 text-3xl font-extrabold leading-tight">Noochi</h1>
          <p className="mt-2 max-w-[26ch] text-cocoa/80">{t('tagline')} — болтай с живыми персонажами, выделяй непонятное и забирай слова с собой.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {['🥐 Paul · A1', '🎬 Sara · B1', '⌨️ Kenji · B2', '♟️ Gregor · C2'].map((p) => (
              <span key={p} className="chip bg-parchment/80 text-cocoaSoft">{p}</span>
            ))}
          </div>
        </div>
        <form onSubmit={submit} className="space-y-3 bg-parchment p-8">
          <h2 className="text-2xl font-extrabold">{mode === 'login' ? t('login') : t('register')}</h2>
          {mode === 'register' && (
            <input className="input" placeholder={t('name')} required {...f('name')} />
          )}
          <input className="input" type="email" placeholder={t('email')} required {...f('email')} />
          <input className="input" type="password" placeholder={t('password')} required minLength={8} {...f('password')} />
          {mode === 'register' && (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm font-bold text-cocoaSoft">{t('native_lang')}
                <select className="input mt-1" {...f('nativeLang')}>
                  {LANG_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label className="text-sm font-bold text-cocoaSoft">{t('target_lang')}
                <select className="input mt-1" {...f('targetLang')}>
                  {LANG_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            </div>
          )}
          {err && <div className="rounded-xl bg-terra/15 px-3 py-2 text-sm font-bold text-terraDeep">{err}</div>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? <Spinner /> : mode === 'login' ? t('login') : t('register')}
          </button>
          <button type="button" className="btn-ghost w-full text-sm" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? t('no_account') : t('have_account')}
          </button>
          <p className="pt-1 text-center text-xs text-cocoaSoft/70">demo: demo@noochi.app / noochi-demo-42</p>
        </form>
      </div>
    </div>
  );
}
