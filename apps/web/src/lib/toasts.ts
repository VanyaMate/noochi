import { create } from 'zustand';

export interface Toast { id: number; text: string; kind: 'ok' | 'err' | 'info' }

interface ToastState {
  toasts: Toast[];
  push: (text: string, kind?: Toast['kind']) => void;
  drop: (id: number) => void;
}

let n = 0;
export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (text, kind = 'info') => {
    const id = ++n;
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3400);
  },
  drop: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
