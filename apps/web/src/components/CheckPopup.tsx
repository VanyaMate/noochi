import { useState } from 'react';
import type { AiCheckRes, CheckIssue, CheckIssueKind } from '@noochi/shared';
import { api } from '../lib/api';
import { useT } from '../lib/i18n';
import { useToasts } from '../lib/toasts';
import { Floating } from './Floating';
import { Spinner } from './ui';
import { sounds } from '../lib/sound';

interface Props {
  check: AiCheckRes;
  rect: DOMRect;
  onClose: () => void;
}

const KIND_KEY: Record<CheckIssueKind, 'check_kind_grammar' | 'check_kind_spelling' | 'check_kind_word' | 'check_kind_punctuation' | 'check_kind_style'> = {
  grammar: 'check_kind_grammar',
  spelling: 'check_kind_spelling',
  word: 'check_kind_word',
  punctuation: 'check_kind_punctuation',
  style: 'check_kind_style',
};

/** a grammar slip becomes a grammar card, everything else a word or a phrase */
function studyKind(issue: CheckIssue): 'grammar' | 'word' | 'phrase' {
  if (issue.kind === 'grammar') return 'grammar';
  return /^\w[\w'-]*$/.test(issue.quote.trim()) ? 'word' : 'phrase';
}

export function CheckPopup({ check, rect, onClose }: Props) {
  const t = useT();
  const push = useToasts((s) => s.push);
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  function add(key: string, issue: CheckIssue) {
    if (added[key] || busy[key]) return;
    setBusy((b) => ({ ...b, [key]: true }));
    api.studyAdd({
      kind: studyKind(issue),
      term: issue.quote.trim().slice(0, 200),
      translation: issue.correction.slice(0, 500) || null,
      meta: { why: issue.note.slice(0, 2000) || undefined },
    }).then(() => {
      setAdded((a) => ({ ...a, [key]: true }));
      push(t('added'), 'ok');
      sounds.chime();
    }).catch((e: Error) => { push(e.message, 'err'); sounds.error(); })
      .finally(() => setBusy((b) => ({ ...b, [key]: false })));
  }

  return (
    <Floating rect={rect} onClose={onClose} width={400}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="font-extrabold">{t('check_title')}</div>
        <button className="btn-ghost h-7 w-7 p-0 text-sm" onClick={onClose}>✕</button>
      </div>

      {check.ok ? (
        <div className="rounded-xl bg-sage/20 px-3 py-3 text-sm font-semibold text-sageDeep">
          ✓ {check.summary || t('check_clean')}
        </div>
      ) : (
        <>
          <p className="mb-2 text-sm font-semibold text-cocoaSoft">{check.summary}</p>
          <ul className="space-y-2">
            {check.issues.map((issue, i) => {
              const key = `${i}-${issue.quote}`;
              return (
                <li key={key} className="rounded-xl bg-latte/50 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-cocoaSoft/80 line-through">{issue.quote}</span>
                    <span className="text-cocoaSoft/60">→</span>
                    <b className="text-terraDeep">{issue.correction}</b>
                    <span className="chip ml-auto bg-parchment text-cocoaSoft/80">{t(KIND_KEY[issue.kind])}</span>
                    <button
                      className={`btn-ghost grid h-6 w-6 shrink-0 place-items-center p-0 text-xs ${added[key] ? 'text-sageDeep' : ''}`}
                      title={t('add_to_study')}
                      disabled={!!added[key] || !!busy[key]}
                      onClick={() => add(key, issue)}
                    >{added[key] ? '✓' : busy[key] ? <Spinner size={11} /> : '🌱'}</button>
                  </div>
                  {!!issue.note && <div className="mt-1 text-xs leading-relaxed text-cocoaSoft">{issue.note}</div>}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {!check.ok && !!check.polished && (
        <div className="mt-3 rounded-xl bg-honey/25 px-3 py-2">
          <div className="text-xs font-bold uppercase tracking-wide text-cocoaSoft/70">{t('check_polished')}</div>
          <div className="mt-0.5 text-sm leading-relaxed">{check.polished}</div>
        </div>
      )}
    </Floating>
  );
}
