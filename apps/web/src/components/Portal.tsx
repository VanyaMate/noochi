import { type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Fixed-positioned layers must hang directly off <body>: a `backdrop-filter` (or `transform`,
 * `filter`, `will-change`) on any ancestor silently makes that ancestor the containing block, so
 * an `inset-0` overlay ends up the size of a 68px chat footer and its content hangs off-screen.
 */
export function Portal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}
