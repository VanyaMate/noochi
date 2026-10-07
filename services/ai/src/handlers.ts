import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  AppError, S, DEFAULT_MODEL, CEFR_LEVELS, CHECK_ISSUE_KINDS,
  type AiExplainReq, type AiExplainRes, type AiReplyReq, type AiCheckReq, type AiCheckRes,
  type AiTranslateReq, type AiTranslateRes, type AiExplainListReq, type AiExplainRemoveReq,
  type ExplainRecord,
} from '@noochi/shared';
import { characters, explains, toExplain, userAiSettings, toCharacter } from '@noochi/db';
import { decryptSecret, newId, type Stack, type HandlerMap } from '@noochi/platform';
import {
  buildCharacterSystemPrompt, buildExplainPrompt, buildCheckPrompt,
  buildReplyCheckTail, buildTranslatePrompt, pickTurnFlavor,
} from '@noochi/prompts';
import { chatCompletion, chatCompletionStream, type OrMessage } from './or.js';
import { extractJsonObject } from './json.js';
import { createCheckGate, splitCheckBlock } from './checkblock.js';

async function resolveAi(stack: Stack, userId: string) {
  const rows = await stack.db.select().from(userAiSettings).where(eq(userAiSettings.userId, userId)).limit(1);
  const settings = rows[0];
  let apiKey = stack.env.openrouterApiKey;
  if (settings?.apiKeyEnc) {
    try { apiKey = decryptSecret(settings.apiKeyEnc, stack.env.secretsKey); } catch { /* fall back to server key */ }
  }
  if (!apiKey) {
    throw new AppError('AI_KEY_MISSING', 'Add your OpenRouter API key in Profile → AI, or set OPENROUTER_API_KEY on the server');
  }
  return {
    apiKey,
    model: settings?.model ?? DEFAULT_MODEL,
    temperature: (settings?.temperature ?? 70) / 100,
    baseUrl: stack.env.openrouterBaseUrl,
  };
}

const zCefr = z.enum(CEFR_LEVELS);

/** Small models answer with near-JSON: optional fields, string arrays instead of objects, "B1 (intermediate)". */
const zLooseArray = z.preprocess(
  (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]),
  z.array(z.unknown()),
);

const zExplainParsed = z.object({
  term: z.string().catch('').default(''),
  translation: z.string().catch('').default(''),
  ipa: z.string().nullable().catch(null).optional(),
  pos: z.string().nullable().catch(null).optional(),
  level: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().slice(0, 2).toUpperCase() : null),
    zCefr.nullable().catch(null),
  ).optional(),
  why: z.string().catch('').default(''),
  what: z.string().catch('').default(''),
  alternatives: zLooseArray.transform((list) => list.map((item) => {
    if (typeof item === 'string') return { word: item, note: '' };
    const o = (item ?? {}) as Record<string, unknown>;
    return { word: typeof o.word === 'string' ? o.word : typeof o.term === 'string' ? o.term : '', note: typeof o.note === 'string' ? o.note : '' };
  })).default([]),
  grammar: z.string().nullable().catch(null).optional(),
  examples: zLooseArray.transform((list) => list.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)).default([]),
});

const zCheckParsed = z.object({
  ok: z.boolean().catch(false).optional(),
  summary: z.string().catch('').default(''),
  issues: zLooseArray.transform((list) => list.map((item) => {
    const o = (item ?? {}) as Record<string, unknown>;
    const note = typeof o.note === 'string' ? o.note : typeof o.explanation === 'string' ? o.explanation : '';
    return {
      quote: typeof o.quote === 'string' ? o.quote : typeof o.original === 'string' ? o.original : '',
      correction: typeof o.correction === 'string' ? o.correction : '',
      note,
      kind: z.enum(CHECK_ISSUE_KINDS).catch('grammar').parse(o.kind),
    };
  })).default([]),
  polished: z.string().nullable().catch(null).optional(),
});

interface AskJsonOpts {
  apiKey: string;
  model: string;
  baseUrl: string;
  prompt: string;
  label: string;
  parse: (value: unknown) => { ok: boolean; result: object };
}

function explainResult(value: unknown, fallbackTerm: string): { ok: boolean; result: AiExplainRes } {
  const parsed = zExplainParsed.parse(value);
  const translation = parsed.translation.trim();
  const why = parsed.why.trim();
  const what = parsed.what.trim();
  if (!translation && !why && !what) return { ok: false, result: { term: '', translation: '', ipa: null, pos: null, level: null, what: '', why: '', alternatives: [], grammar: null, examples: [] } };
  return {
    ok: true,
    result: {
      term: parsed.term.trim() || fallbackTerm,
      translation,
      ipa: parsed.ipa ?? null,
      pos: parsed.pos ?? null,
      level: parsed.level ?? null,
      what,
      why,
      alternatives: parsed.alternatives.filter((a) => a.word.trim()).slice(0, 5),
      grammar: parsed.grammar ?? null,
      examples: parsed.examples.slice(0, 3),
    },
  };
}

function checkResult(value: unknown): { ok: boolean; result: AiCheckRes } {
  const parsed = zCheckParsed.parse(value);
  const issues = parsed.issues.filter((i) => i.quote.trim() && i.correction.trim());
  const empty = { ok: false, issues: [], summary: '', polished: null } satisfies AiCheckRes;
  if (!parsed.summary.trim() && !issues.length && parsed.ok === undefined) return { ok: false, result: empty };
  return {
    ok: true,
    result: {
      ok: parsed.ok ?? issues.length === 0,
      issues,
      summary: parsed.summary.trim() || (issues.length ? `${issues.length} thing(s) to fix` : 'Looks good'),
      polished: parsed.polished ?? null,
    },
  };
}

/** The proofread that came inside the character's reply — a broken block is simply no proofread. */
function checkFromBlock(block: string | null): AiCheckRes | null {
  if (!block) return null;
  try {
    const parsed = checkResult(extractJsonObject(block));
    if (!parsed.ok) console.log(`[noochi:ai] reply check block unusable; raw: ${block.replace(/\s+/g, ' ').slice(0, 240)}`);
    return parsed.ok ? parsed.result : null;
  } catch {
    console.log(`[noochi:ai] reply check block is not json; raw: ${block.replace(/\s+/g, ' ').slice(0, 240)}`);
    return null;
  }
}

/**
 * One JSON-shaped completion, retried once with a stricter reminder: models that wrap the object in
 * prose or cut it off usually behave on a second, colder attempt.
 */
async function askForJson({ apiKey, model, baseUrl, prompt, label, parse }: AskJsonOpts): Promise<object> {
  let lastProblem = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const content = attempt === 0
      ? prompt
      : `${prompt}\n\nYour previous answer could not be read as JSON. Reply with ONLY the JSON object — no markdown fence, no commentary, and close every brace.`;
    const raw = await chatCompletion({
      apiKey,
      model,
      baseUrl,
      temperature: attempt === 0 ? 0.3 : 0.1,
      maxTokens: 1400,
      messages: [{ role: 'user', content }],
    });
    try {
      const { ok, result } = parse(extractJsonObject(raw));
      if (ok) return result;
      lastProblem = 'fields missing';
    } catch (e) {
      lastProblem = e instanceof Error ? e.message : String(e);
    }
    console.log(`[noochi:ai] ${label} attempt ${attempt + 1} rejected (${lastProblem}); raw: ${raw.replace(/\s+/g, ' ').slice(0, 400)}`);
  }
  throw new AppError(
    'AI_UNPARSABLE',
    `${model} did not return a readable ${label} (twice). Try again, or pick another model in Profile.`,
  );
}

export function aiHandlers(stack: Stack): HandlerMap {
  return {
    // Generate a character reply AND proofread the learner's message in the same completion.
    // Streams only the prose: the JSON block behind the marker is parsed, never shown.
    [S.ai.reply]: async (req: AiReplyReq) => {
      const ai = await resolveAi(stack, req.userId);
      const charRows = await stack.db.select().from(characters).where(eq(characters.id, req.characterId)).limit(1);
      if (!charRows.length) throw new AppError('NOT_FOUND', 'Character disappeared');
      const character = toCharacter(charRows[0]);
      const system = buildCharacterSystemPrompt(character, { flavor: pickTurnFlavor() })
        + buildReplyCheckTail({ text: req.text, nativeLang: req.nativeLang, targetLang: req.targetLang });
      const history: OrMessage[] = [...req.history.slice(-24).map((m) => ({
        role: m.sender === 'user' ? 'user' as const : 'assistant' as const,
        content: m.text,
      })), { role: 'user' as const, content: req.text }];

      let pending = '';
      const flush = () => {
        if (!pending) return;
        stack.bus.publish(`evt.chat.${req.conversationId}`, {
          type: 'stream_delta', conversationId: req.conversationId, requestId: req.requestId,
          characterId: req.characterId, delta: pending, done: false,
        });
        pending = '';
      };
      const gate = createCheckGate((chunk) => { pending += chunk; if (pending.length >= 16) flush(); });

      const full = await chatCompletionStream({
        apiKey: ai.apiKey,
        model: ai.model,
        baseUrl: ai.baseUrl,
        temperature: ai.temperature,
        maxTokens: 700,
        messages: [{ role: 'system', content: system }, ...history],
        onDelta: (d) => gate.feed(d),
      });
      const block = gate.finish();
      flush();
      stack.bus.publish(`evt.chat.${req.conversationId}`, {
        type: 'stream_delta', conversationId: req.conversationId, requestId: req.requestId,
        characterId: req.characterId, delta: '', done: true,
      });

      const { text } = splitCheckBlock(full);
      return { text: text || '...', check: checkFromBlock(block) };
    },

    // Explain a selected word/phrase/sentence as structured JSON, and keep it in the «Разборы» history.
    [S.ai.explain]: async (req: AiExplainReq): Promise<AiExplainRes> => {
      await stack.bus.request(S.billing.increment, { userId: req.userId, kind: 'explains' });
      const ai = await resolveAi(stack, req.userId);
      const result = await askForJson({
        apiKey: ai.apiKey,
        model: ai.model,
        baseUrl: ai.baseUrl,
        label: 'explanation',
        prompt: buildExplainPrompt(req),
        parse: (value) => explainResult(value, req.text),
      }) as AiExplainRes;
      await stack.db.insert(explains).values({
        id: newId(),
        userId: req.userId,
        term: result.term || req.text,
        context: req.context ?? null,
        nativeLang: req.nativeLang,
        targetLang: req.targetLang,
        result,
      });
      return result;
    },

    // Proofread the learner's own message on demand (used to re-check a message without a new reply).
    [S.ai.check]: async (req: AiCheckReq): Promise<AiCheckRes> => {
      const ai = await resolveAi(stack, req.userId);
      const result = await askForJson({
        apiKey: ai.apiKey,
        model: ai.model,
        baseUrl: ai.baseUrl,
        label: 'correction',
        prompt: buildCheckPrompt(req),
        parse: checkResult,
      });
      return result as AiCheckRes;
    },

    // Write the learner's own words in the language of the chat.
    [S.ai.translate]: async (req: AiTranslateReq): Promise<AiTranslateRes> => {
      const ai = await resolveAi(stack, req.userId);
      const result = await askForJson({
        apiKey: ai.apiKey,
        model: ai.model,
        baseUrl: ai.baseUrl,
        label: 'translation',
        prompt: buildTranslatePrompt(req),
        parse: (value) => {
          const o = (value ?? {}) as Record<string, unknown>;
          const translation = typeof o.translation === 'string' ? o.translation.trim()
            : typeof o.text === 'string' ? o.text.trim() : '';
          if (!translation) return { ok: false, result: { translation: '', note: '' } };
          return {
            ok: true,
            result: {
              translation,
              note: typeof o.note === 'string' ? o.note.trim() : '',
            } satisfies AiTranslateRes,
          };
        },
      });
      return result as AiTranslateRes;
    },

    [S.ai.explainList]: async ({ userId, limit }: AiExplainListReq): Promise<ExplainRecord[]> => {
      const rows = await stack.db.select().from(explains)
        .where(eq(explains.userId, userId))
        .orderBy(desc(explains.createdAt))
        .limit(limit);
      return rows.map(toExplain);
    },

    [S.ai.explainRemove]: async (req: AiExplainRemoveReq) => {
      await stack.db.delete(explains)
        .where(and(eq(explains.id, req.explainId), eq(explains.userId, req.userId)));
      return { ok: true } as const;
    },
  };
}
