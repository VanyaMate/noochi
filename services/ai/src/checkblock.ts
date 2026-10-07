import { CHECK_BLOCK_MARKER } from '@noochi/prompts';

/** Models drift the marker's case and pad it with spaces; whatever follows it is machine text either way. */
const MARKER = /<<<\s*CHECK\s*>>>/i;

/** Longest marker a model can plausibly pad out to — the streaming gate holds this much back. */
const HOLD = CHECK_BLOCK_MARKER.length + 12;

export interface ReplySplit {
  /** What the user should see — the character's message. */
  text: string;
  /** Raw JSON tail after the marker, or null when the model skipped the check block. */
  block: string | null;
}

/** The machine block always trails the prose, behind a marker that must never reach the bubble. */
export function splitCheckBlock(full: string): ReplySplit {
  const at = MARKER.exec(full);
  if (!at) return { text: full.trim(), block: null };
  return { text: full.slice(0, at.index).trim(), block: full.slice(at.index + at[0].length) };
}

/**
 * Streaming gate: deltas up to the marker are forwarded, everything from it on is kept for JSON
 * parsing. The last chars of an unfinished marker are held back so it can't leak between two deltas.
 */
export function createCheckGate(forward: (text: string) => void) {
  let pre = '';
  let block = '';
  let hit = false;
  return {
    feed(delta: string) {
      if (hit) { block += delta; return; }
      pre += delta;
      const at = MARKER.exec(pre);
      if (at) {
        hit = true;
        if (at.index > 0) forward(pre.slice(0, at.index));
        block = pre.slice(at.index + at[0].length);
        pre = '';
        return;
      }
      if (pre.length > HOLD) {
        forward(pre.slice(0, pre.length - HOLD));
        pre = pre.slice(pre.length - HOLD);
      }
    },
    /** Call after the stream ends: releases the held tail and returns the JSON block. */
    finish(): string | null {
      if (hit) return block;
      if (pre) forward(pre);
      return null;
    },
  };
}
