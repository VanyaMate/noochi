import { useCallback, useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { CEFR_LEVELS, type CefrLevel, type Character } from '@noochi/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useT } from '../lib/i18n';
import { LevelChip, Modal, Spinner } from '../components/ui';
import { ExplainPopup } from '../components/ExplainPopup';
import { useToasts } from '../lib/toasts';
import { reportApiError } from '../App';
import { sounds } from '../lib/sound';

export default function PeoplePage() {
  const t = useT();
  const nav = useNavigate();
  const user = useAuth((s) => s.user);
  const push = useToasts((s) => s.push);
  const [level, setLevel] = useState<CefrLevel | 'all'>('all');
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<Character | null>(null);
  const [popup, setPopup] = useState<{ text: string; context?: string; rect: DOMRect } | null>(null);

  const { data: bots, refetch } = useQuery({
    queryKey: ['catalog', level, user?.id],
    queryFn: () => api.catalog(level === 'all' ? {} : { level }),
  });

  const { data: plan } = useQuery({ queryKey: ['billingStatus'], queryFn: () => api.billingStatus() });
  /** why the create button is dead — the plan either has no own characters or ran out of them */
  const lockReason = !plan ? '' : plan.usage.ownCharacters.limit - plan.usage.ownCharacters.used > 0 ? ''
    : plan.features.ownCharacters
      ? t('create_locked_full').replace('{n}', String(plan.usage.ownCharacters.limit))
      : t('create_locked_plus');

  const open = useMutation({
    mutationFn: (c: Character) => api.openChat(c.id),
    onSuccess: (res) => { sounds.open(); setViewing(null); nav(`/chats/${res.conversation.id}`); },
    onError: reportApiError,
  });

  // same gesture as in the chat: select any text inside a [data-explain] block to break it down
  const onSelect = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('[data-explain]')) return;
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? '';
    if (text.length < 2 || text.length > 200 || !sel || sel.rangeCount === 0) return;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const block = target.closest('[data-explain]') as HTMLElement;
    setPopup({ text, context: block.dataset.explain || block.textContent || undefined, rect });
  }, []);

  useEffect(() => {
    document.addEventListener('mouseup', onSelect);
    return () => document.removeEventListener('mouseup', onSelect);
  }, [onSelect]);

  const closeExplain = useCallback(() => {
    setPopup(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-1 flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold">{t('people_title')}</h1>
            <p className="text-sm text-cocoaSoft">{t('people_sub')} · {t('people_hint')}</p>
          </div>
          <button
            className={`btn-warm ${lockReason ? 'cursor-not-allowed opacity-50' : ''}`}
            disabled={!!lockReason}
            title={lockReason || undefined}
            onClick={() => setCreating(true)}
          >＋ {t('create_char')}</button>
        </div>

        <div className="my-4 flex flex-wrap gap-1.5">
          <button onClick={() => setLevel('all')} className={`chip transition ${level === 'all' ? 'bg-dusk text-cream' : 'bg-parchment text-cocoaSoft hover:bg-latte'}`}>{t('all_levels')}</button>
          {CEFR_LEVELS.map((l) => (
            <button key={l} onClick={() => setLevel(l)}
              className={`chip transition ${level === l ? 'bg-dusk text-cream' : 'bg-parchment text-cocoaSoft hover:bg-latte'}`}>
              {l}
            </button>
          ))}
        </div>

        {!bots ? <div className="grid place-items-center py-16"><Spinner size={26} /></div> :
          bots.length === 0 ? <p className="py-10 text-center text-cocoaSoft">{t('no_bots')}</p> : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {bots.map((c, i) => (
                <button
                  key={c.id}
                  onClick={() => { sounds.open(); setViewing(c); }}
                  className="card group animate-rise p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lift"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <div className="flex items-center gap-3">
                    <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-2xl shadow-soft ${c.gradient}`}>{c.emoji}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-extrabold">
                        <span className="truncate">{c.name}</span><LevelChip level={c.level} />
                        {!c.isPublic && <span className="chip bg-latte text-cocoaSoft">private</span>}
                      </div>
                      <div className="truncate text-sm text-cocoaSoft">{c.tagline}</div>
                    </div>
                  </div>
                  <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-cocoa/80">{c.persona}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {c.interests.slice(0, 4).map((it) => <span key={it} className="chip bg-honey/30 text-cocoaSoft">{it}</span>)}
                  </div>
                </button>
              ))}
            </div>
          )}
      </div>
      <CreateCharacter open={creating} onClose={() => setCreating(false)} onDone={() => { refetch(); push(t('saved'), 'ok'); }} />

      {viewing && (
        <Modal open onClose={() => setViewing(null)} wide>
          <div className="mb-3 flex items-center gap-3">
            <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-3xl shadow-soft ${viewing.gradient}`}>{viewing.emoji}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xl font-extrabold">
                <span className="truncate">{viewing.name}</span>
                <LevelChip level={viewing.level} />
                {!viewing.isPublic && <span className="chip bg-latte text-cocoaSoft">private</span>}
              </div>
              <div className="text-sm text-cocoaSoft">{viewing.tagline}</div>
            </div>
          </div>

          <div className="mb-3 rounded-xl bg-latte/60 px-3 py-2.5">
            <div className="text-xs font-bold uppercase tracking-wide text-cocoaSoft/70">{t('about_char')}</div>
            <p className="mt-1 text-sm leading-relaxed" data-explain={viewing.persona}>{viewing.persona}</p>
          </div>

          {!!viewing.welcome && (
            <div className="mb-3 rounded-xl bg-honey/25 px-3 py-2.5">
              <div className="text-xs font-bold uppercase tracking-wide text-cocoaSoft/70">{t('char_welcome')}</div>
              <p className="mt-1 text-sm italic leading-relaxed" data-explain={viewing.welcome}>“{viewing.welcome}”</p>
            </div>
          )}

          {!!viewing.style && (
            <div className="mb-3">
              <div className="mb-1 text-xs font-bold uppercase tracking-wide text-cocoaSoft/70">{t('char_style')}</div>
              <p className="text-sm leading-relaxed" data-explain={viewing.style}>{viewing.style}</p>
            </div>
          )}

          {!!viewing.interests.length && (
            <div className="mb-1">
              <div className="mb-1 text-xs font-bold uppercase tracking-wide text-cocoaSoft/70">{t('interests')}</div>
              <div className="flex flex-wrap gap-1">
                {viewing.interests.map((it) => <span key={it} className="chip bg-honey/30 text-cocoaSoft">{it}</span>)}
              </div>
            </div>
          )}

          <p className="mt-3 text-xs text-cocoaSoft/70">{t('people_select_hint')}</p>

          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setViewing(null)}>{t('close')}</button>
            <button className="btn-primary" disabled={open.isPending} onClick={() => open.mutate(viewing)}>
              {open.isPending ? <Spinner size={16} /> : <>💬 {t('char_start')}</>}
            </button>
          </div>
        </Modal>
      )}

      {popup && (
        <ExplainPopup text={popup.text} context={popup.context} rect={popup.rect} onClose={closeExplain} />
      )}
    </div>
  );
}

function CreateCharacter({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const [form, setForm] = useState({
    name: '', level: 'A2' as CefrLevel, tagline: '', emoji: '🐣',
    gradient: 'from-sky-200 to-violet-300', persona: '', interests: '', style: '', welcome: '', formality: 'casual' as const,
  });
  const m = useMutation({
    mutationFn: () => api.createChar({
      name: form.name, level: form.level, tagline: form.tagline, emoji: form.emoji,
      gradient: form.gradient, persona: form.persona, style: form.style, welcome: form.welcome,
      interests: form.interests.split(',').map((s) => s.trim()).filter(Boolean),
      formality: form.formality, lang: 'en',
    }),
    onSuccess: () => { onDone(); onClose(); },
    onError: reportApiError,
  });
  return (
    <Modal open={open} onClose={onClose} wide>
      <h3 className="mb-1 text-xl font-extrabold">{t('create_char')}</h3>
      <p className="mb-4 text-sm text-cocoaSoft">{t('create_char_sub')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <input className="input" placeholder={t('char_name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <select className="input" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value as CefrLevel })}>
          {CEFR_LEVELS.map((l) => <option key={l}>{l}</option>)}
        </select>
        <input className="input" placeholder={t('char_tagline')} value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
        <input className="input" placeholder={t('char_emoji')} value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} />
        <textarea className="input sm:col-span-2" rows={4} placeholder={`${t('char_persona')}…`} value={form.persona} onChange={(e) => setForm({ ...form, persona: e.target.value })} />
        <input className="input sm:col-span-2" placeholder={t('char_interests')} value={form.interests} onChange={(e) => setForm({ ...form, interests: e.target.value })} />
        <input className="input" placeholder={t('char_style')} value={form.style} onChange={(e) => setForm({ ...form, style: e.target.value })} />
        <input className="input" placeholder={t('char_welcome')} value={form.welcome} onChange={(e) => setForm({ ...form, welcome: e.target.value })} />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>{t('cancel')}</button>
        <button className="btn-primary" disabled={!form.name || form.persona.length < 10 || m.isPending} onClick={() => m.mutate()}>
          {m.isPending ? <Spinner /> : t('create')}
        </button>
      </div>
    </Modal>
  );
}
