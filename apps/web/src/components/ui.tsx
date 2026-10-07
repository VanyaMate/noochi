import type { ReactNode } from 'react';
import { useContentSize } from '../lib/size';
import { useToasts } from '../lib/toasts';
import { Portal } from './Portal';

export function Toasts() {
  const { toasts, drop } = useToasts();
  return (
    <div className="fixed bottom-5 left-1/2 z-[100] -translate-x-1/2 space-y-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => drop(t.id)}
          className={`animate-pop block rounded-xl px-4 py-2 text-sm font-bold shadow-lift ${
            t.kind === 'err' ? 'bg-terraDeep text-parchment' : t.kind === 'ok' ? 'bg-sageDeep text-parchment' : 'bg-dusk/90 text-cream'
          }`}
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}

export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <span
      className="inline-block animate-spin rounded-full border-2 border-cocoaSoft/20 border-t-terra align-middle"
      style={{ width: size, height: size }}
    />
  );
}

export function Modal({ open, onClose, children, wide }: { open: boolean; onClose: () => void; children: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-dusk/40 p-4 backdrop-blur-sm" onClick={onClose}>
        {/* own component so the animated size restarts from scratch for every modal that opens */}
        <ModalCard wide={wide} onClose={onClose}>{children}</ModalCard>
      </div>
    </Portal>
  );
}

/** Centred card that eases into its new height as the content inside changes. */
function ModalCard({ onClose, wide, children }: { onClose: () => void; wide?: boolean; children: ReactNode }) {
  const { ref, size } = useContentSize<HTMLDivElement>();
  return (
    <div
      style={size.h ? { height: size.h } : undefined}
      className={`card animate-pop w-full overflow-hidden transition-[height] duration-200 ease-out ${wide ? 'max-w-2xl' : 'max-w-md'}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div ref={ref} className="max-h-[88vh] w-full overflow-y-auto p-5">{children}</div>
    </div>
  );
}

export function LevelChip({ level }: { level: string }) {
  const colors: Record<string, string> = {
    A1: 'bg-honey/30 text-cocoa', A2: 'bg-honey/20 text-cocoaSoft',
    B1: 'bg-sage/30 text-sageDeep', B2: 'bg-sage/20 text-sageDeep',
    C1: 'bg-terra/20 text-terraDeep', C2: 'bg-terra/30 text-terraDeep',
  };
  return <span className={`chip ${colors[level] ?? 'bg-latte text-cocoaSoft'}`}>{level}</span>;
}
