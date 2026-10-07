import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { onCloseAway, place } from '../lib/anchor';
import { useContentSize } from '../lib/size';
import { Portal } from './Portal';

/**
 * A card pinned next to whatever the user touched, which grows and shrinks smoothly instead of
 * snapping when its content changes: the animated width/height live on the outer box while the
 * inner box keeps the real content size, so measuring never reads the in-between frames.
 */
export function Floating({
  rect, onClose, width, children,
}: {
  rect: DOMRect; onClose: () => void; width: number; children: ReactNode;
}) {
  const { ref, size } = useContentSize<HTMLDivElement>();
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  /** the first placement must be instant, otherwise the card flies in from the top-left corner */
  const [settling, setSettling] = useState(true);

  useEffect(() => onCloseAway(ref, onClose), [onClose]);

  useLayoutEffect(() => {
    if (!size.w || !size.h) return;
    const p = place(rect, size.w, size.h);
    setPos((cur) => (cur && cur.top === p.top && cur.left === p.left ? cur : p));
  }, [rect, size]);

  useEffect(() => {
    if (!pos || !settling) return;
    const id = requestAnimationFrame(() => setSettling(false));
    return () => cancelAnimationFrame(id);
  }, [pos, settling]);

  return (
    <Portal>
      <div
        style={{
          top: pos?.top ?? 0, left: pos?.left ?? 0,
          ...(size.w ? { width: size.w, height: size.h } : null),
          transition: settling ? 'none'
            : 'width 220ms cubic-bezier(.2,.8,.2,1), height 220ms cubic-bezier(.2,.8,.2,1), top 220ms cubic-bezier(.2,.8,.2,1), left 220ms cubic-bezier(.2,.8,.2,1)',
        }}
        className={`card fixed z-50 overflow-hidden shadow-lift ${pos ? 'animate-pop' : 'invisible'}`}
      >
        <div ref={ref} style={{ width, maxWidth: '92vw', maxHeight: 'calc(100dvh - 24px)' }} className="overflow-y-auto p-4">
          {children}
        </div>
      </div>
    </Portal>
  );
}
