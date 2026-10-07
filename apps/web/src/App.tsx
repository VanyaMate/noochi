import { Suspense, lazy, useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth, useIsAdmin } from './lib/auth';
import { useT } from './lib/i18n';
import { Toasts, Spinner } from './components/ui';
import { RadioBar } from './components/RadioBar';
import { ExplainTray } from './components/ExplainTray';
import { ApiError } from './lib/api';
import { useToasts } from './lib/toasts';

const AuthPage = lazy(() => import('./pages/Auth'));
const ChatsPage = lazy(() => import('./pages/Chats'));
const PeoplePage = lazy(() => import('./pages/People'));
const StudyPage = lazy(() => import('./pages/Study'));
const ExplainsPage = lazy(() => import('./pages/Explains'));
const ReviewPage = lazy(() => import('./pages/Review'));
const ProfilePage = lazy(() => import('./pages/Profile'));
const PlansPage = lazy(() => import('./pages/Plans'));
const AdminPage = lazy(() => import('./pages/Admin'));

function Shell({ children }: { children: React.ReactNode }) {
  const t = useT();
  const user = useAuth((s) => s.user);
  const signOut = useAuth((s) => s.signOut);
  const isAdmin = useIsAdmin();
  const loc = useLocation();

  const nav = [
    { to: '/chats', label: t('nav_chats'), icon: '💬' },
    { to: '/people', label: t('nav_people'), icon: '🦊' },
    { to: '/study', label: t('nav_study'), icon: '🌱' },
    { to: '/explains', label: t('nav_explains'), icon: '🔍' },
    ...(isAdmin ? [{ to: '/admin', label: t('nav_admin'), icon: '🛠️' }] : []),
  ];

  return (
    <div className="flex h-dvh">
      <aside className="flex w-56 shrink-0 flex-col gap-1 border-r border-latte/70 bg-parchment/60 p-3 backdrop-blur">
        <div className="mb-2 flex items-center gap-2 px-2 pt-1">
          <span className="text-2xl animate-glow">🦉</span>
          <div>
            <div className="text-lg font-extrabold leading-5">Noochi</div>
            <div className="text-[11px] text-cocoaSoft/80">{t('tagline')}</div>
          </div>
        </div>
        {nav.map((n) => (
          <NavLink
            key={n.to} to={n.to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-xl px-3 py-2 font-semibold transition ${
                isActive || (n.to === '/chats' && loc.pathname.startsWith('/chats'))
                  ? 'bg-terra/15 text-terraDeep' : 'text-cocoaSoft hover:bg-latte/60'}`}
          >
            <span>{n.icon}</span>{n.label}
          </NavLink>
        ))}
        <div className="mt-auto">
          <ExplainTray />
          <RadioBar />
          <div className="mt-1 flex items-center gap-2.5 rounded-xl px-3 py-2 transition hover:bg-latte/60">
            <NavLink to="/profile" className={({ isActive }) => `flex min-w-0 flex-1 items-center gap-2.5 font-semibold ${isActive ? 'text-terraDeep' : 'text-cocoaSoft'}`}>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-honey to-terra text-sm font-extrabold text-parchment">
                {user?.name?.[0]?.toUpperCase() ?? '?'}
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm">{user?.name}</div>
                <div className="text-[11px] text-cocoaSoft/70">{t('profile_title')}</div>
              </div>
            </NavLink>
            <NavLink
              to="/plans" title={t('plans_title')}
              className="shrink-0 rounded-lg bg-latte/70 px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-cocoaSoft transition hover:bg-terra/20 hover:text-terraDeep"
            >
              {user?.planId ?? '—'}
            </NavLink>
          </div>
          <button className="btn-ghost w-full justify-start text-sm" onClick={() => { signOut(); }}>
            ⎋ {t('logout')}
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-hidden">
        <Suspense fallback={<div className="grid h-full place-items-center"><Spinner size={28} /></div>}>
          {children}
        </Suspense>
      </main>
    </div>
  );
}

export default function App() {
  const { token, hydrated, hydrate } = useAuth();
  const [booting, setBooting] = useState(true);
  const push = useToasts((s) => s.push);

  useEffect(() => {
    hydrate().finally(() => setBooting(false));
  }, [hydrate]);

  // surface limit errors globally
  useEffect(() => {
    const h = (e: Event) => {
      const err = (e as CustomEvent).detail as ApiError;
      if (err?.code?.startsWith?.('LIMIT')) push(err.message, 'err');
      else if (err?.code === 'AI_KEY_MISSING') push(err.message, 'err');
    };
    window.addEventListener('noochi:api-error', h);
    return () => window.removeEventListener('noochi:api-error', h);
  }, [push]);

  if (booting) return <div className="grid h-dvh place-items-center"><Spinner size={30} /></div>;

  return (
    <>
      <Toasts />
      <Routes>
        <Route path="/auth" element={token ? <Navigate to="/chats" replace /> : <Suspense fallback={null}><AuthPage /></Suspense>} />
        <Route path="/*" element={
          token
            ? <Shell><Suspense fallback={<div className="grid h-full place-items-center"><Spinner size={28} /></div>}>
                <Routes>
                  <Route path="/" element={<Navigate to="/chats" replace />} />
                  <Route path="/chats" element={<ChatsPage />} />
                  <Route path="/chats/:conversationId" element={<ChatsPage />} />
                  <Route path="/people" element={<PeoplePage />} />
                  <Route path="/study" element={<StudyPage />} />
                  <Route path="/explains" element={<ExplainsPage />} />
                  <Route path="/review" element={<ReviewPage />} />
                  <Route path="/profile" element={<ProfilePage />} />
                  <Route path="/plans" element={<PlansPage />} />
                  <Route path="/admin" element={<AdminPage />} />
                  <Route path="*" element={<Navigate to="/chats" replace />} />
                </Routes>
              </Suspense></Shell>
            : <Navigate to="/auth" replace />
        } />
      </Routes>
    </>
  );
}

export function reportApiError(e: unknown) {
  if (e instanceof ApiError) {
    window.dispatchEvent(new CustomEvent('noochi:api-error', { detail: e }));
    return e;
  }
  console.error(e);
  return e;
}
