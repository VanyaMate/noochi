import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { StudyItem } from '@noochi/shared';
import { api } from '../lib/api';
import { useT } from '../lib/i18n';
import { LevelChip, Spinner } from '../components/ui';
import { reportApiError } from '../App';
import { sounds } from '../lib/sound';

type Grade = 'again' | 'hard' | 'good' | 'easy';

export default function ReviewPage() {
  const t = useT();
  const qc = useQueryClient();
  const [queue, setQueue] = useState<StudyItem[] | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [doneCount, setDoneCount] = useState(0);

  const { data: due, isLoading } = useQuery({
    queryKey: ['study', 'due'],
    queryFn: () => api.studyList({ dueOnly: true }),
  });

  const start = () => {
    const items = (due ?? []).filter((i) => i.state === 'new' || new Date(i.dueAt) <= endOfToday());
    if (!items.length) return;
    setQueue([...items].sort(() => Math.random() - 0.5).slice(0, 20));
    setDoneCount(0);
    sounds.open();
  };

  const review = useMutation({
    mutationFn: ({ id, grade }: { id: string; grade: Grade }) => api.studyReview(id, grade),
    onSuccess: () => {
      sounds.chime();
      setQueue((q) => (q ? q.slice(1) : q));
      setRevealed(false);
      setDoneCount((c) => c + 1);
      qc.invalidateQueries({ queryKey: ['study'] });
    },
    onError: reportApiError,
  });

  const current = queue?.[0];
  const finished = queue !== null && queue.length === 0;

  if (isLoading) return <div className="grid h-full place-items-center"><Spinner size={26} /></div>;

  return (
    <div className="flex h-full flex-col items-center overflow-y-auto p-6">
      <div className="w-full max-w-xl flex-1">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-extrabold">🔁 {t('review_mode')}</h1>
          {queue && !finished && (
            <span className="text-sm font-bold text-cocoaSoft">{queue.length} {t('review_left')}</span>
          )}
        </div>

        {!queue && (
          <div className="card mt-10 p-8 text-center animate-rise">
            <div className="mb-3 text-5xl">🌱</div>
            <p className="mb-1 text-lg font-extrabold">{t('due_today')}: {due?.length ?? 0}</p>
            <p className="mb-6 text-sm text-cocoaSoft">{(due?.length ?? 0) === 0 ? t('review_empty') : ''}</p>
            {(due?.length ?? 0) > 0
              ? <button className="btn-primary mx-auto" onClick={start}>{t('review_start')}</button>
              : <Link to="/study" className="btn-warm mx-auto">{t('nav_study')}</Link>}
          </div>
        )}

        {finished && (
          <div className="card mt-10 p-8 text-center animate-rise">
            <div className="mb-3 text-5xl">✨</div>
            <p className="text-lg font-extrabold">{doneCount ? 'Готово!' : t('review_empty')}</p>
            <p className="mb-6 text-sm text-cocoaSoft">{doneCount ? `разобрано карточек: ${doneCount}` : ''}</p>
            <button className="btn-ghost mx-auto" onClick={() => { setQueue(null); qc.invalidateQueries({ queryKey: ['study', 'due'] }); }}>← {t('nav_review')}</button>
          </div>
        )}

        {current && (
          <div className="card animate-pop p-6">
            <div className="mb-4 flex items-center gap-2">
              {current.meta.level && <LevelChip level={current.meta.level} />}
              <span className="chip bg-latte text-cocoaSoft">{current.kind}</span>
              <span className="chip bg-parchment text-cocoaSoft/80">шаг {current.srsStep}</span>
            </div>
            <div className="my-6 text-center text-3xl font-extrabold leading-snug">{current.term}</div>

            {revealed ? (
              <div className="space-y-3">
                <div className="rounded-xl bg-latte/60 px-4 py-3 text-center text-xl font-bold">{current.translation ?? '—'}</div>
                {current.meta.what && (
                  <p className="text-sm leading-relaxed text-cocoa/90"><b className="text-cocoaSoft">{t('what_label')}</b> {current.meta.what}</p>
                )}
                {current.meta.why && <p className="text-sm leading-relaxed text-cocoa/90">{current.meta.why}</p>}
                {current.meta.grammar && (
                  <p className="text-sm leading-relaxed text-cocoa/90"><b className="text-cocoaSoft">{t('grammar_label')}</b> {current.meta.grammar}</p>
                )}
                {(current.meta.examples?.length || current.meta.example) && (
                  <div className="rounded-xl bg-honey/25 px-4 py-2.5 text-sm italic">
                    <div className="mb-0.5 text-[11px] font-bold uppercase not-italic tracking-wide text-cocoaSoft/70">{t('examples_label')}</div>
                    {(current.meta.examples?.length ? current.meta.examples : [current.meta.example!]).map((ex) => <div key={ex}>“{ex}”</div>)}
                  </div>
                )}
                {current.meta.context && (
                  <div className="rounded-xl bg-latte/50 px-4 py-2.5 text-sm">
                    <div className="mb-0.5 text-[11px] font-bold uppercase tracking-wide text-cocoaSoft/70">{t('context_label')}</div>
                    <div className="leading-relaxed">“{current.meta.context}”</div>
                  </div>
                )}
                <div className="grid grid-cols-4 gap-2 pt-2">
                  {(['again', 'hard', 'good', 'easy'] as Grade[]).map((g) => (
                    <button key={g}
                      onClick={() => review.mutate({ id: current.id, grade: g })}
                      disabled={review.isPending}
                      className={`btn rounded-xl py-2.5 text-sm font-extrabold text-parchment transition hover:-translate-y-0.5 ${
                        g === 'again' ? 'bg-terraDeep' : g === 'hard' ? 'bg-terra' : g === 'good' ? 'bg-sageDeep' : 'bg-honey text-cocoa'}`}
                    >
                      {t(g)}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <button className="btn-primary w-full py-3" onClick={() => { setRevealed(true); sounds.click(); }}>
                {t('show_answer')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function endOfToday() {
  const d = new Date(); d.setHours(23, 59, 59, 999); return d;
}
