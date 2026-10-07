import { create } from 'zustand';
import type { AiExplainRes } from '@noochi/shared';

/** One breakdown the user started. It survives closing the popup, so a click elsewhere never loses it. */
export interface TrayItem {
  id: string;
  term: string;
  context?: string;
  res: AiExplainRes | null;
}

interface TrayState {
  items: TrayItem[];
  start: (item: TrayItem) => void;
  resolve: (id: string, res: AiExplainRes) => void;
  drop: (id: string) => void;
  clear: () => void;
}

const MAX = 6;

export const useTray = create<TrayState>((set) => ({
  items: [],
  start: (item) => set((s) => ({ items: [item, ...s.items.filter((x) => x.id !== item.id)].slice(0, MAX) })),
  resolve: (id, res) => set((s) => ({ items: s.items.map((x) => (x.id === id ? { ...x, res } : x)) })),
  /** a failed breakdown stays as an inline error in the popup, not as a dead entry here */
  drop: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
  clear: () => set({ items: [] }),
}));
