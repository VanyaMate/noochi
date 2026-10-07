import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { StudyItem, StudyKind } from '@noochi/shared';
import { api } from '../lib/api';
import { useT } from '../lib/i18n';

import { LevelChip, Spinner } from '../components/ui';
import { reportApiError } from '../App';
import { sounds } from '../lib/sound';

const KINDS: StudyKind[] = ['word', 'phrase', 'grammar'];

export default function StudyPage() {
  const t = useT();
  const qc = useQueryClient();
  const [kind, setKind] = useState<StudyKind | 'all'>('all');
  const [dueOnly, setDueOnly] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: items, isLoading } = useQuery({
    queryKey: ['study', kind, dueOnly],
    queryFn: () => api.studyList({ kind: kind === 'all' ? undefined : kind, dueOnly }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.studyRemove(id),
    onSuccess: () => { sounds.click(); qc.invalidateQueries({ queryKey: ['study'] }); },
    onError: reportApiError,
  });

  const [term, setTerm] = useState('');
  const [translation, setTranslation] = useState('');
  const add = useMutation({
    mutationFn: () => api.studyAdd({
      kind: term.trim().split(/\s+/).length > 1 ? 'phrase' : 'word',
      term: term.trim(), translation: translation.trim() || null,
    }),
    onSuccess: () => {
      setTerm(''); setTranslation('');
      sounds.chime();
      qc.invalidateQueries({ queryKey: ['study'] });
    },
    onError: reportApiError,
  });

  const dueCount = (items ?? []).filter((i) => new Date(i.dueAt) <= endOfToday() || i.state === 'new').length;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-1 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-extrabold">{t('nav_study')}</h1>
          <Link to="/review" className="btn-warm">🔁 {t('review_start')} {dueCount > 0 && <span className="ml-1 rounded-full bg-parchment/30 px-1.5 text-xs">{dueCount}</span>}</Link>
        </div>

        <div className="my-4 flex flex-wrap items-center gap-1.5">
          {(['all', ...KINDS] as const).map((k) => (
            <button key={k} onClick={() => setKind(k)}
              className={`chip transition ${kind === k ? 'bg-dusk text-cream' : 'bg-parchment text-cocoaSoft hover:bg-latte'}`}>
              {k === 'all' ? t('all_kinds') : k === 'word' ? t('nav_words') : k === 'phrase' ? t('phrases') : t('nav_grammar')}
            </button>
          ))}
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm font-semibold text-cocoaSoft">
            <input type="checkbox" checked={dueOnly} onChange={(e) => setDueOnly(e.target.checked)} className="accent-terra" />
            {t('due_today')}
          </label>
        </div>

        <form className="card mb-4 flex flex-wrap items-center gap-2 p-3"
          onSubmit={(e) => { e.preventDefault(); if (term.trim()) add.mutate(); }}>
          <input className="input min-w-40 flex-1" placeholder={t('nav_words') + ' / …'} value={term} onChange={(e) => setTerm(e.target.value)} />
          <input className="input min-w-40 flex-1" placeholder={t('translation')} value={translation} onChange={(e) => setTranslation(e.target.value)} />
          <button className="btn-primary" disabled={!term.trim() || add.isPending}>
            {add.isPending ? <Spinner size={16} /> : `＋ ${t('add_to_study')}`}
          </button>
        </form>

        {isLoading ? <div className="grid place-items-center py-14"><Spinner size={26} /></div>
          : !items?.length ? <p className="py-12 text-center text-cocoaSoft">🌱 {t('review_empty')}</p> : (
            <div className="space-y-2">
              {items.map((it, i) => (
                <Card key={it.id} it={it} i={i}
                  open={expanded === it.id}
                  onToggle={() => setExpanded(expanded === it.id ? null : it.id)}
                  onRemove={() => remove.mutate(it.id)} />
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

function endOfToday() {
  const d = new Date(); d.setHours(23, 59, 59, 999); return d;
}

function Card({ it, i, open, onToggle, onRemove }: {
  it: StudyItem; i: number; open: boolean; onToggle: () => void; onRemove: () => void;
}) {
  const t = useT();
  const due = new Date(it.dueAt) <= endOfToday() || it.state === 'new';
  const stateChip = it.state === 'new' ? 'bg-honey/30 text-cocoa'
    : it.state === 'known' ? 'bg-sage/30 text-sageDeep' : 'bg-latte text-cocoaSoft';
  return (
    <div className="card animate-rise p-3.5" style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}>
      <div className="flex items-center gap-2.5">
        <button className="min-w-0 flex-1 text-left" onClick={onToggle}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-extrabold">{it.term}</span>
            {it.meta.level && <LevelChip level={it.meta.level} />}
            <span className={`chip ${stateChip}`}>{it.state}</span>
            {due && <span className="chip bg-terra/15 text-terraDeep">●</span>}
          </div>
          {it.translation && <div className="truncate text-sm text-cocoaSoft">{it.translation}</div>}
        </button>
        <button className="btn-ghost h-8 w-8 p-0 text-sm" title="удалить" onClick={onRemove}>✕</button>
      </div>
      {open && (
        <div className="mt-3 space-y-2 border-t border-latte/70 pt-3 text-sm">
          {it.meta.what && <div><b className="text-cocoaSoft">{t('what_label')}</b> {it.meta.what}</div>}
          {it.meta.why && <div><b className="text-cocoaSoft">{t('why_label')}</b> {it.meta.why}</div>}
          {it.meta.grammar && <div><b className="text-cocoaSoft">{t('grammar_label')}</b> {it.meta.grammar}</div>}
          {!!it.meta.alternatives?.length && (
            <div className="flex flex-wrap gap-1.5">
              {it.meta.alternatives.map((a) => (
                <span key={a.word} className="chip bg-latte/70 text-cocoaSoft" title={a.note}><b className="text-cocoa">{a.word}</b>{a.note ? ` — ${a.note}` : ''}</span>
              ))}
            </div>
          )}
          {(it.meta.examples?.length || it.meta.example) && (
            <div className="rounded-lg bg-honey/25 px-3 py-2 italic">
              <div className="mb-0.5 text-[11px] font-bold uppercase not-italic tracking-wide text-cocoaSoft/70">{t('examples_label')}</div>
              {(it.meta.examples?.length ? it.meta.examples : [it.meta.example!]).map((ex) => <div key={ex}>“{ex}”</div>)}
            </div>
          )}
          {it.meta.context && (
            <div className="rounded-lg bg-latte/50 px-3 py-2">
              <div className="mb-0.5 text-[11px] font-bold uppercase tracking-wide text-cocoaSoft/70">{t('context_label')}</div>
              <div className="leading-relaxed">“{it.meta.context}”</div>
            </div>
          )}
          <div className="text-xs text-cocoaSoft/70">
            шаг SRS: {it.srsStep} · повтор: {new Date(it.dueAt).toLocaleDateString()}
          </div>
        </div>
      )}
    </div>
  );
}
