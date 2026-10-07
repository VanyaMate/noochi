import { useState } from 'react';
import type { AiExplainRes } from '@noochi/shared';
import { useT } from '../lib/i18n';
import { useTray } from '../lib/tray';
import { ExplainPopup } from './ExplainPopup';
import { Spinner } from './ui';

/**
 * Breakdowns the user started, parked in the sidebar: clicking anywhere else closed the popup, and
 * without this list the answer would be gone even though the model kept working on it.
 */
export function ExplainTray() {
  const t = useT();
  const items = useTray((s) => s.items);
  const drop = useTray((s) => s.drop);
  const [viewing, setViewing] = useState<{ text: string; context?: string; rect: DOMRect; initial: AiExplainRes } | null>(null);

  if (!items.length) return null;

  return (
    <>
      <div className="mb-1 rounded-xl bg-parchment/70 px-2 py-1.5">
        <div className="px-1 pb-1 text-[11px] font-bold uppercase tracking-wide text-cocoaSoft/70">🔍 {t('tray_title')}</div>
        <ul className="space-y-0.5">
          {items.map((i) => (
            <li key={i.id} className="group flex items-center gap-1">
              <button
                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1 text-left text-xs transition hover:bg-latte/70"
                disabled={!i.res}
                title={i.res ? t('tray_open') : t('explain_loading')}
                onClick={(e) => {
                  if (!i.res) return;
                  setViewing({ text: i.term, context: i.context, rect: e.currentTarget.getBoundingClientRect(), initial: i.res });
                }}
              >
                <span className="min-w-0 flex-1 truncate font-semibold">{i.term}</span>
                {i.res
                  ? <span className="shrink-0 text-sageDeep">✓ {t('tray_open')}</span>
                  : <><Spinner size={10} /><span className="shrink-0 text-cocoaSoft/70">{t('explain_loading')}</span></>}
              </button>
              <button
                className="btn-ghost h-5 w-5 shrink-0 p-0 text-[10px] opacity-0 transition group-hover:opacity-100"
                title={t('tray_remove')}
                onClick={() => { if (viewing?.text === i.term) setViewing(null); drop(i.id); }}
              >✕</button>
            </li>
          ))}
        </ul>
      </div>
      {viewing && (
        <ExplainPopup
          text={viewing.text} context={viewing.context} rect={viewing.rect} initial={viewing.initial}
          onClose={() => setViewing(null)}
        />
      )}
    </>
  );
}
