import { create } from 'zustand';
import type { PublicUser } from '@noochi/shared';
import { api, ApiError, setTokenGetter } from './api';
import { qc } from './query';
import { useTray } from './tray';

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: PublicUser | null;
  hydrated: boolean;
  signIn: (t: { accessToken: string; refreshToken: string }, user: PublicUser) => void;
  signOut: () => void;
  setUser: (u: PublicUser) => void;
  hydrate: () => Promise<void>;
}

const LS = 'noochi.auth';

export const useAuth = create<AuthState>((set, get) => ({
  token: null,
  refreshToken: null,
  user: null,
  hydrated: false,
  signIn: (tokens, user) => {
    // query keys carry no user id, so the cached data of the previous account would pass for the new one
    if (tokens.accessToken !== get().token) { qc.clear(); useTray.getState().clear(); }
    localStorage.setItem(LS, JSON.stringify({ token: tokens.accessToken, refreshToken: tokens.refreshToken }));
    set({ token: tokens.accessToken, refreshToken: tokens.refreshToken, user });
  },
  signOut: () => {
    qc.clear();
    useTray.getState().clear();
    localStorage.removeItem(LS);
    set({ token: null, refreshToken: null, user: null });
  },
  setUser: (user) => set({ user }),
  hydrate: async () => {
    if (get().hydrated) return;
    const raw = localStorage.getItem(LS);
    if (raw) {
      try {
        const { token, refreshToken } = JSON.parse(raw) as { token: string; refreshToken: string };
        set({ token, refreshToken });
        try {
          const user = await api.me();
          set({ user, hydrated: true });
          return;
        } catch (e) {
          // only a rejected token may end the session — a 429/500 at boot must not log the user out
          if (e instanceof ApiError && e.code === 'UNAUTHORIZED') {
            localStorage.removeItem(LS);
            set({ token: null, refreshToken: null, user: null });
          } else {
            setTimeout(() => { void api.me().then((u) => set({ user: u })).catch(() => { /* stay signed in */ }); }, 4000);
          }
        }
      } catch { /* corrupted storage */ }
    }
    set({ hydrated: true });
  },
}));

setTokenGetter(() => useAuth.getState().token);

export const useIsAdmin = () => useAuth((s) => s.user?.role === 'admin');
