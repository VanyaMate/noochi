/** Prompt for the "explain selected text" popup. Output must be strict JSON. */
export const EXPLAIN_SCHEMA_HINT = `Return ONLY one JSON object, no code fences, with exactly these fields:
{
 "term": string,               // the exact selected text
 "translation": string,        // translation into the user's native language
 "ipa": string | null,         // pronunciation for single words, else null
 "pos": string | null,         // part of speech in native language terms ("глагол", "фразовый глагол"...)
 "level": "A1"|"A2"|"B1"|"B2"|"C1"|"C2"|null, // CEFR level of this item
 "what": string,               // 1-2 sentences in native language: what this thing IS at all — name the phenomenon plainly ("это неправильный глагол", "устойчивое выражение", "форма прошедшего времени")
 "why": string,                // why THIS word/form was used here, 1-3 friendly sentences in native language
 "alternatives": [{"word": string, "note": string}], // 2-4 near-synonyms / other forms, with a short nuance note each, in native language
 "grammar": string | null,     // the grammar pattern involved, explained simply in native language, or null
 "examples": [string, string, string]  // 3 short natural example sentences in the target language, using the same pattern as the selected text
}`;

export function buildExplainPrompt(opts: {
  text: string;
  context?: string;
  nativeLang: string;
  targetLang: string;
}): string {
  const langName = (c: string) => ({ en: 'English', ru: 'Russian', de: 'German', fr: 'French', es: 'Spanish' }[c] ?? c);
  return `You are a friendly language tutor inside a reading popup. The user selected this ${langName(opts.targetLang)} text:

"""${opts.text}"""
${opts.context ? `\nContext of the conversation where it appeared:\n"""${opts.context}"""\n` : ''}
Explain it for a self-learner whose native language is ${langName(opts.nativeLang)}.
Be concrete and warm, no lecturing, every field in ${langName(opts.nativeLang)} except "term" and "examples".
If the selection is a full sentence, translate it fully and put the interesting pattern into "why"/"grammar".
If it is slang/idiom, say what it really means and how risky it is to use.
If it is a grammar form ("i went", "have been") or a set phrase, first say in plain words WHAT it is and when people use it, then give three everyday examples that show the same pattern — a learner should get the feel of it, not only the rule.
${opts.context ? 'Mention how the selected text works inside that context sentence.' : ''}

${EXPLAIN_SCHEMA_HINT}`;
}
