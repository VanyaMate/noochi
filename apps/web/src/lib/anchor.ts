const MARGIN = 10;

/**
 * Where to put a w×h card next to the text the user touched: below → above → side → centered,
 * clamped into the viewport. Size comes in as numbers, not measured from the node, because an
 * animated card reports its mid-transition size and would anchor itself a few pixels off.
 */
export function place(rect: DOMRect, w: number, h: number): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const below = rect.bottom + MARGIN;
  const above = rect.top - h - MARGIN;

  let top: number;
  let left: number;
  if (below + h <= vh - MARGIN || above >= MARGIN) {
    top = below + h <= vh - MARGIN ? below : above;
    left = rect.left + rect.width / 2 - w / 2;
  } else {
    const rightRoom = vw - rect.right - MARGIN;
    const leftRoom = rect.left - MARGIN;
    if (Math.max(rightRoom, leftRoom) >= w) {
      left = rightRoom >= leftRoom ? rect.right + MARGIN : rect.left - w - MARGIN;
      top = rect.top;
    } else {
      top = (vh - h) / 2;
      left = (vw - w) / 2;
    }
  }
  return { top: Math.max(MARGIN, top), left: Math.max(MARGIN, Math.min(left, vw - w - MARGIN)) };
}

/** Close the card when the pointer goes down outside it (skips the very click that opened it). */
export function onCloseAway(ref: React.RefObject<HTMLElement>, onClose: () => void): () => void {
  const handler = (e: MouseEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) onClose();
  };
  document.addEventListener('mousedown', handler);
  return () => document.removeEventListener('mousedown', handler);
}
