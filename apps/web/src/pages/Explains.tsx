import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ExplainRecord } from '@noochi/shared';
import { api } from '../lib/api';
import { useT } from '../lib/i18n';
import { Modal, Spinner } from '../components/ui';
import { ExplainView } from '../components/ExplainView';
import { reportApiError } from '../App';

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export default function ExplainsPage() {
  const t = useT();
  const qc = useQueryClient();
  const [viewing, setViewing] = useState<ExplainRecord | null>(null);

  const { data: items } = useQuery({
    queryKey: ['explains'],
    queryFn: () => api.explains({ limit: 200 }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.explainRemove(id),
    onSuccess: () => { setViewing(null); qc.invalidateQueries({ queryKey: ['explains'] }); },
    onError: reportApiError,
  });

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-1">
          <h1 className="text-2xl font-extrabold">{t('explains_title')}</h1>
          <p className="text-sm text-cocoaSoft">{t('explains_sub')}</p>
        </div>

        {!items ? <div className="grid place-items-center py-16"><Spinner size={26} /></div> :
          items.length === 0 ? (
            <p className="py-10 text-center text-cocoaSoft">{t('explains_empty')}</p>
          ) : (
            <div className="mt-4 space-y-1.5">
              {items.map((r, i) => (
                <button
                  key={r.id}
                  onClick={() => { setViewing(r); }}
                  className="card animate-rise flex w-full items-center gap-3 p-3 text-left transition hover:-translate-y-0.5 hover:shadow-lift"
                  style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-extrabold">{r.term}</span>
                    <span className="block truncate text-sm text-cocoaSoft">{r.result.translation || '—'}</span>
                  </span>
                  {r.result.level && <span className="chip shrink-0 bg-sage/20 text-sageDeep">{r.result.level}</span>}
                  <span className="chip shrink-0 bg-latte/70 text-cocoaSoft">{r.targetLang}</span>
                  <span className="w-16 shrink-0 text-right text-xs tabular-nums text-cocoaSoft/60">{day(r.createdAt)}</span>
                </button>
              ))}
            </div>
          )}
      </div>

      {viewing && (
        <Modal open onClose={() => setViewing(null)} wide>
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-xl font-extrabold">“{viewing.term}”</div>
              <div className="text-xs text-cocoaSoft/70">{new Date(viewing.createdAt).toLocaleString()}</div>
            </div>
            <button className="btn-ghost h-7 w-7 shrink-0 p-0 text-sm" onClick={() => setViewing(null)}>✕</button>
          </div>
          {!!viewing.context && (
            <p className="mb-3 rounded-xl bg-latte/50 px-3 py-2 text-sm italic leading-relaxed text-cocoaSoft">“{viewing.context}”</p>
          )}
          <ExplainView res={viewing.result} term={viewing.term} context={viewing.context ?? undefined} />
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-ghost text-terraDeep" disabled={remove.isPending} onClick={() => remove.mutate(viewing.id)}>
              {remove.isPending ? <Spinner size={16} /> : `🗑 ${t('explains_delete')}`}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
