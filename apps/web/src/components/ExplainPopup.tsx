import { useEffect, useState } from 'react';
import type { AiExplainRes } from '@noochi/shared';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useT } from '../lib/i18n';
import { useTray } from '../lib/tray';
import { useToasts } from '../lib/toasts';
import { Spinner } from './ui';
import { Floating } from './Floating';
import { ExplainView } from './ExplainView';
import { sounds } from '../lib/sound';

interface Props {
  text: string;
  context?: string;
  rect: DOMRect;
  onClose: () => void;
  /** a breakdown already done in this session — shown at once, without a second request */
  initial?: AiExplainRes;
}

export function ExplainPopup({ text, context, rect, onClose, initial }: Props) {
  const t = useT();
  const id = `${text}::${context?.slice(0, 60) ?? ''}`;
  const [res, setRes] = useState<AiExplainRes | null>(initial ?? null);
  const [err, setErr] = useState<{ msg: string; fromModel: boolean } | null>(null);
  const [started, setStarted] = useState(!!initial);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!started || initial) return;
    let dead = false;
    setErr(null);
    // the tray keeps the breakdown even if the popup is closed while the model is still thinking
    const tray = useTray.getState();
    tray.start({ id, term: text, context, res: null });
    const me = useAuth.getState().user;
    api.explain({ text, context, nativeLang: me?.nativeLang ?? 'ru', targetLang: me?.targetLang ?? 'en' })
      .then((r) => { useTray.getState().resolve(id, r); if (!dead) setRes(r); })
      .catch((e: Error) => {
        useTray.getState().drop(id);
        // the popup may be gone by now — the user still has to learn the breakdown failed
        if (dead) { useToasts.getState().push(`${t('explain_failed')}: “${text}”`, 'err'); sounds.error(); return; }
        setErr({ msg: e.message, fromModel: e instanceof ApiError && e.code === 'AI_UNPARSABLE' });
      });
    return () => { dead = true; };
    // `t` and the user object change identity on every render — keeping them out of deps is what stops
    // this effect from re-firing and re-firing the request forever
  }, [started, nonce, text, context]);

  useEffect(() => { sounds.open(); }, []);

  return (
    <Floating rect={rect} onClose={onClose} width={380}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="truncate font-extrabold">“{text}”</div>
        <button className="btn-ghost h-7 w-7 p-0 text-sm" onClick={onClose}>✕</button>
      </div>
      {!started && (
        <div className="py-1">
          <p className="mb-3 text-xs leading-relaxed text-cocoaSoft">{t('explain_hint')}</p>
          <button className="btn-primary w-full" onClick={() => setStarted(true)}>🔍 {t('explain_start')}</button>
        </div>
      )}
      {started && !res && !err && <div className="grid place-items-center py-8"><Spinner /><div className="mt-2 text-sm text-cocoaSoft">{t('explain_loading')}</div></div>}
      {err && (
        <div className="py-4">
          <div className="mb-1 text-sm font-bold text-terraDeep">{err.fromModel ? t('explain_model_note') : t('explain_failed')}</div>
          <p className="mb-3 text-xs leading-relaxed text-cocoaSoft">{err.msg}</p>
          <button className="btn-warm w-full" onClick={() => { setRes(null); setNonce((n) => n + 1); }}>🔁 {t('explain_retry')}</button>
        </div>
      )}
      {res && <ExplainView res={res} term={text} context={context} onAdded={onClose} />}
    </Floating>
  );
}
