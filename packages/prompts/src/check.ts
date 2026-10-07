/** Prompt for checking the learner's own message for mistakes. Output must be strict JSON. */
import { langName } from './lang.js';

export const CHECK_SCHEMA_HINT = `Return ONLY one JSON object, no code fences, no prose around it, with exactly these fields:
{
 "ok": boolean,                  // true when there is nothing worth fixing
 "summary": string,              // one short friendly verdict in the native language
 "issues": [                     // empty array when ok is true
   {
     "quote": string,            // the exact fragment from the message, copied verbatim
     "correction": string,       // how to write it instead
     "note": string,             // why, up to ~12 words, in the native language
     "kind": "grammar"|"spelling"|"word"|"punctuation"|"style"
   }
 ],
 "polished": string | null       // the whole message rewritten naturally, or null if nothing changed
}`;

export function buildCheckPrompt(opts: {
  text: string;
  level?: string;
  nativeLang: string;
  targetLang: string;
}): string {
  const level = opts.level ? ` The learner is around CEFR ${opts.level}.` : '';
  return `You proofread a message written by a language learner${level} in ${langName(opts.targetLang)}.

"""${opts.text}"""

Report only real mistakes a careful native speaker would flag: broken grammar, wrong preposition or verb form, misspelling, wrong word choice that changes the meaning, missing article where it is required, punctuation that hurts reading.
Do NOT report: casual style, slang, short messenger-length sentences, missing capitalization at the start, things a native speaker would happily write themselves. Personal taste is not a mistake.
If the message is fine, say so: "ok": true and an empty "issues" array. Never invent problems to seem useful.
Every "quote" must be copied verbatim from the message, "correction" must be the full fixed fragment.
"summary" and every "note" in ${langName(opts.nativeLang)}, everything else in ${langName(opts.targetLang)}.

${CHECK_SCHEMA_HINT}`;
}

/** Marker the character's reply is followed by; the app never shows it (or anything after it) to the user. */
export const CHECK_BLOCK_MARKER = '<<<CHECK>>>';

/**
 * Asks for the proofread in the SAME completion as the character's reply, so one message costs
 * one upstream call. The block goes after the prose, behind a marker the streaming layer splits on.
 */
export function buildReplyCheckTail(opts: {
  text: string;
  level?: string;
  nativeLang: string;
  targetLang: string;
}): string {
  return `
# Second task in the same answer (machine part)
After your chat message, add one empty line, then exactly this marker on its own line:
${CHECK_BLOCK_MARKER}
Then, right below the marker, one JSON object checking the learner's message quoted below — the message you are replying to:

"""${opts.text}"""

${opts.level ? `The learner is around CEFR ${opts.level}.` : ''}
Use the same fields as a proofread task:
${CHECK_SCHEMA_HINT}

Rules: your chat message stays plain text with nothing after it except the marker block; never write the marker inside the message;
copy every "quote" verbatim from the learner's message; "summary" and "note" in ${langName(opts.nativeLang)}; if the message is correct, "ok": true with an empty "issues".`;
}
