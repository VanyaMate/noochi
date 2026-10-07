import { useState } from 'react';
import type { AiExplainRes } from '@noochi/shared';
import { api } from '../lib/api';
import { useT } from '../lib/i18n';
import { useToasts } from '../lib/toasts';
import { sounds } from '../lib/sound';
import { Spinner } from './ui';

/**
 * A finished explanation, drawn the same way in the popup next to a selection and on the
 * «разборы» page. `term` is what the user actually selected — the model may normalise it.
 */
export function ExplainView({ res, term, context, onAdded }: {
  res: AiExplainRes; term: string; context?: string; onAdded?: () => void;
}) {
  const t = useT();
  const push = useToasts((s) => s.push);
  const [tab, setTab] = useState<'why' | 'alt' | 'grammar'>('why');
  const [busy, setBusy] = useState(false);

  function add() {
    if (busy) return;
    setBusy(true);
    const single = /^\w[\w'-]*$/.test(term.trim());
    api.studyAdd({
      kind: single ? 'word' : 'phrase',
      term: term.trim().slice(0, 200),
      translation: res.translation.slice(0, 500),
      meta: {
        what: res.what.slice(0, 1000) || undefined,
        why: res.why, alternatives: res.alternatives, grammar: res.grammar ?? undefined,
        example: res.examples[0]?.slice(0, 500),
        examples: res.examples.map((ex) => ex.slice(0, 500)),
        context: context?.slice(0, 500),
        level: res.level ?? undefined,
      },
    }).then(() => { push(t('added'), 'ok'); sounds.chime(); onAdded?.(); })
      .catch((e: Error) => { push(e.message, 'err'); sounds.error(); })
      .finally(() => setBusy(false));
  }

  return (
    <>
      <div className="mb-3 rounded-xl bg-latte/60 px-3 py-2">
        <span className="text-xs font-bold uppercase tracking-wide text-cocoaSoft/70">{t('translation')}</span>
        <div className="text-lg font-extrabold leading-snug">
          {res.translation}
          {res.ipa && <span className="ml-2 text-sm font-medium text-cocoaSoft">{res.ipa}</span>}
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
          {res.pos && <span className="chip bg-parchment text-cocoaSoft">{res.pos}</span>}
          {res.level && <span className="chip bg-sage/20 text-sageDeep">{res.level}</span>}
        </div>
      </div>
      {!!res.what && (
        <div className="mb-3 rounded-xl bg-honey/20 px-3 py-2">
          <div className="text-xs font-bold uppercase tracking-wide text-cocoaSoft/70">{t('what_label')}</div>
          <p className="mt-0.5 text-sm leading-relaxed">{res.what}</p>
        </div>
      )}
      <div className="mb-2 flex gap-1">
        {([['why', t('why')], ['alt', t('alternatives')], ['grammar', t('grammar')]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`chip transition ${tab === k ? 'bg-dusk text-cream' : 'bg-latte/70 text-cocoaSoft hover:bg-latte'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'why' && <p className="mb-2 text-sm leading-relaxed">{res.why}</p>}
      {tab === 'alt' && (
        <ul className="mb-2 space-y-1 text-sm">
          {res.alternatives.map((a) => (
            <li key={a.word} className="rounded-lg bg-latte/50 px-2.5 py-1.5">
              <b>{a.word}</b>{a.note && <span className="text-cocoaSoft"> — {a.note}</span>}
            </li>
          ))}
          {!res.alternatives.length && <li className="text-cocoaSoft">—</li>}
        </ul>
      )}
      {tab === 'grammar' && <p className="mb-2 text-sm leading-relaxed">{res.grammar ?? '—'}</p>}
      {!!res.examples.length && (
        <div className="mb-3 rounded-xl bg-honey/25 px-3 py-2 text-sm italic text-cocoa/90">
          <div className="mb-0.5 text-xs font-bold uppercase not-italic tracking-wide text-cocoaSoft/70">{t('examples_label')}</div>
          {res.examples.map((ex) => <div key={ex}>“{ex}”</div>)}
        </div>
      )}
      <button className="btn-primary flex w-full items-center justify-center gap-2" disabled={busy} onClick={add}>
        {busy ? <><Spinner size={14} /> {t('adding')}</> : `🌱 ${t('add_to_study')}`}
      </button>
    </>
  );
}
