import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Live size of a node, re-read whenever its content grows or shrinks. Uses offsetWidth/Height and
 * not getBoundingClientRect: a card that animates its own size would otherwise measure the
 * mid-transition value and feed it back into itself.
 */
export function useContentSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize((s) =>
      s.w === el.offsetWidth && s.h === el.offsetHeight ? s : { w: el.offsetWidth, h: el.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, size };
}
