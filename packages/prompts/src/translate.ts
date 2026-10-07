import { langName } from './lang.js';

/**
 * The learner wants to say something but can't phrase it in the target language yet:
 * they write it in their own language and get a version a person at their level would send.
 */
export function buildTranslatePrompt(opts: {
  text: string;
  nativeLang: string;
  targetLang: string;
  level?: string;
}): string {
  const level = opts.level ? `The learner is around CEFR ${opts.level} — keep the wording inside that budget.` : '';
  return `Translate a message from ${langName(opts.nativeLang)} into ${langName(opts.targetLang)} so it can be sent in a casual chat.

"""${opts.text}"""

${level}
It must sound like a real person typing in a messenger: natural, informal, same length and tone as the original, no literary polish, no explanations inside the translation.

Return ONLY one JSON object, no code fences:
{
 "translation": string,   // the message in ${langName(opts.targetLang)}, ready to send
 "note": string           // one short sentence in ${langName(opts.nativeLang)}: what this version implies / how to sound softer or more neutral
}`;
}
