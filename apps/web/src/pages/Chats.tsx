import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import type {
  AiCheckRes, AiTranslateRes, CefrLevel, Character, ChatEvent, CheckIssueKind, Conversation, Message,
} from '@noochi/shared';
import { api, rid } from '../lib/api';
import { useT } from '../lib/i18n';
import { wsHub } from '../lib/ws';
import { sounds } from '../lib/sound';
import { Modal, Spinner } from '../components/ui';
import { ExplainPopup } from '../components/ExplainPopup';
import { CheckPopup } from '../components/CheckPopup';
import { reportApiError } from '../App';
import { useAuth } from '../lib/auth';

type CheckState = { status: 'pending' | 'done' | 'failed'; result?: AiCheckRes };

/** One cache entry for the whole thread: streamed drafts live here too, so "append the
 *  persisted message" and "drop the draft it came from" commit in the same render. */
interface ThreadData {
  messages: Message[];
  hasMore: boolean;
  conversation?: Conversation;
  character?: Character;
  /** requestId → partial bot reply, removed as soon as that reply is stored */
  drafts: Record<string, string>;
  /** requestId → our own message, shown before the server echoes it back */
  outgoing: Record<string, string>;
}

/** keep only the still-unsaved entries — the stored rows with these requestIds arrived */
function dropStored<T>(pending: Record<string, T>, stored: Set<string>): Record<string, T> {
  if (!Object.keys(pending).length) return pending;
  const rest = Object.fromEntries(Object.entries(pending).filter(([requestId]) => !stored.has(requestId)));
  return Object.keys(rest).length === Object.keys(pending).length ? pending : rest;
}

/** drop drafts whose reply already arrived — the user message shares the requestId, so only
 *  bot/system rows count as "stored" here */
function reconcileDrafts(drafts: Record<string, string>, msgs: Message[]): Record<string, string> {
  return dropStored(drafts, new Set(msgs.filter((m) => m.sender !== 'user').map((m) => m.requestId ?? '')));
}

function reconcileOutgoing(outgoing: Record<string, string>, msgs: Message[]): Record<string, string> {
  return dropStored(outgoing, new Set(msgs.filter((m) => m.sender === 'user').map((m) => m.requestId ?? '')));
}

/** The optimistic bubble and the message it turns into must keep one key, or React remounts the row and the rise animation plays twice. */
const bubbleKey = (sender: string, requestId?: string | null, id?: string) => `${sender}:${requestId || id}`;

/** how much a kind of mistake hurts the message */
const ISSUE_WEIGHT: Record<CheckIssueKind, number> = { grammar: 2, word: 2, spelling: 1, punctuation: 1, style: 0 };

/** 0 — чисто, 1 — косметика, 2 — настоящая ошибка, 3 — их несколько и они ломают смысл */
function checkSeverity(r?: AiCheckRes): 0 | 1 | 2 | 3 {
  if (!r?.issues.length) return 0;
  const score = r.issues.reduce((s, i) => s + ISSUE_WEIGHT[i.kind], 0);
  if (score >= 4 || r.issues.length >= 3) return 3;
  return score >= 2 ? 2 : 1;
}

const SEV_STYLE = ['text-cocoaSoft/60', 'text-terraDeep/70', 'text-ember/70', 'text-ember'] as const;

export default function ChatsPage() {
  const t = useT();
  const { conversationId } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);

  const { data: list } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.conversations(),
  });

  const { data: thread, isFetching } = useQuery({
    queryKey: ['thread', conversationId],
    queryFn: async () => {
      const cid = conversationId!;
      const { messages, hasMore } = await api.history(cid);
      const conv = list?.conversations.find((c) => c.id === cid);
      const character = conv ? list?.characters[conv.characterId] : undefined;
      const prev = qc.getQueryData<ThreadData>(['thread', cid]);
      return {
        messages,
        hasMore,
        conversation: conv,
        character,
        drafts: reconcileDrafts(prev?.drafts ?? {}, messages),
        outgoing: reconcileOutgoing(prev?.outgoing ?? {}, messages),
      } satisfies ThreadData;
    },
    enabled: !!conversationId && !!list,
  });

  /** statuses the stored row can't carry — a check still in flight, or one that failed to land */
  const [checkLive, setCheckLive] = useState<Record<string, 'pending' | 'failed'>>({});
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [popup, setPopup] = useState<{ text: string; context?: string; rect: DOMRect } | null>(null);
  const [checkPopup, setCheckPopup] = useState<{ result: AiCheckRes; rect: DOMRect } | null>(null);
  const [layout, setLayout] = useState<ChatLayout>(() =>
    localStorage.getItem('noochi.chatLayout') === 'list' ? 'list' : 'split');

  useEffect(() => {
    localStorage.setItem('noochi.chatLayout', layout);
  }, [layout]);

  useEffect(() => {
    if (!conversationId) return;
    wsHub.sub(conversationId);
    return () => wsHub.unsub(conversationId);
  }, [conversationId]);

  useEffect(() => { setCheckLive({}); }, [conversationId]);

  useEffect(() => {
    return wsHub.on((ev: ChatEvent, cid) => {
      if (cid !== conversationId) return;
      if (ev.type === 'stream_delta') {
        qc.setQueryData<ThreadData>(['thread', cid], (q) => {
          if (!q) return q;
          return { ...q, drafts: { ...q.drafts, [ev.requestId]: (q.drafts[ev.requestId] ?? '') + ev.delta } };
        });
        // safety net: if the persisted-message event never reaches us, the refetch reconciles drafts away
        if (ev.done) {
          sounds.receive();
          setTimeout(() => qc.invalidateQueries({ queryKey: ['thread', cid] }), 700);
        }
      } else if (ev.type === 'message') {
        if (ev.message.sender !== 'user') sounds.receive();
        qc.setQueryData<ThreadData>(['thread', cid], (q) => {
          if (!q) return q;
          const messages = q.messages.some((m) => m.id === ev.message.id) ? q.messages : [...q.messages, ev.message];
          const key = ev.message.requestId;
          const drafts = ev.message.sender === 'bot' && key && q.drafts[key]
            ? Object.fromEntries(Object.entries(q.drafts).filter(([k]) => k !== key))
            : q.drafts;
          const outgoing = ev.message.sender === 'user' && key && q.outgoing[key]
            ? Object.fromEntries(Object.entries(q.outgoing).filter(([k]) => k !== key))
            : q.outgoing;
          return { ...q, messages, drafts, outgoing };
        });
        qc.invalidateQueries({ queryKey: ['conversations'] });
      } else if (ev.type === 'typing') {
        setTyping(ev.on);
      } else if (ev.type === 'check') {
        const result = ev.status === 'done' ? ev.result : undefined;
        if (result) {
          qc.setQueryData<ThreadData>(['thread', cid], (q) => {
            if (!q) return q;
            return { ...q, messages: q.messages.map((m) => (m.id === ev.messageId ? { ...m, check: result } : m)) };
          });
        }
        setCheckLive((p) => (result
          ? Object.fromEntries(Object.entries(p).filter(([id]) => id !== ev.messageId))
          : { ...p, [ev.messageId]: ev.status === 'pending' ? 'pending' : 'failed' }));
      }
    });
  }, [conversationId, qc]);

  /** height of the list before older pages were prepended, so the view stays on the same message */
  const anchorRef = useRef(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // keyed on the newest message, not on the count: loading history must not yank the view back down
    if (!anchorRef.current) el.scrollTop = el.scrollHeight;
    else {
      el.scrollTop += el.scrollHeight - anchorRef.current;
      anchorRef.current = 0;
    }
  }, [thread?.messages.at(-1)?.id, thread?.messages.length, thread?.drafts, thread?.outgoing, typing]);

  const send = useMutation({
    mutationFn: ({ text, requestId }: { text: string; requestId: string }) =>
      api.send(conversationId!, text, requestId).then((r) => ({ ...r, requestId })),
    onMutate: ({ text, requestId }) => {
      sounds.send();
      qc.setQueryData<ThreadData>(['thread', conversationId!], (q) =>
        q ? { ...q, outgoing: { ...q.outgoing, [requestId]: text } } : q);
    },
    onSuccess: ({ userMessage, requestId }) => {
      // the ws 'message' event usually lands before this response — append blindly means two copies
      qc.setQueryData<ThreadData>(['thread', conversationId!], (q) => {
        if (!q) return q;
        const messages = q.messages.some((m) => m.id === userMessage.id) ? q.messages : [...q.messages, userMessage];
        const outgoing = { ...q.outgoing };
        delete outgoing[requestId];
        return { ...q, messages, outgoing };
      });
      setCheckLive((p) => (p[userMessage.id] || userMessage.check ? p : { ...p, [userMessage.id]: 'pending' }));
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (err, { requestId }) => {
      qc.setQueryData<ThreadData>(['thread', conversationId!], (q) => {
        if (!q || !(requestId in q.outgoing)) return q;
        const outgoing = { ...q.outgoing };
        delete outgoing[requestId];
        return { ...q, outgoing };
      });
      reportApiError(err);
    },
  });

  const older = useMutation({
    mutationFn: (before: string) => {
      anchorRef.current = scrollRef.current?.scrollHeight ?? 0;
      return api.history(conversationId!, before);
    },
    onSuccess: ({ messages, hasMore }) => {
      qc.setQueryData<ThreadData>(['thread', conversationId!], (q) =>
        q ? { ...q, messages: [...messages, ...q.messages], hasMore } : q);
    },
    onError: (err) => { anchorRef.current = 0; reportApiError(err); },
  });

  const closeExplain = useCallback(() => {
    setPopup(null);
    window.getSelection()?.removeAllRanges();
  }, []);
  const closeCheckPopup = useCallback(() => setCheckPopup(null), []);

  const onSelect = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('[data-bot-text]')) return;
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? '';
    if (text.length < 2 || text.length > 200 || !sel || sel.rangeCount === 0) return;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const bubble = target.closest('[data-bot-text]') as HTMLElement;
    setPopup({ text, context: bubble.dataset.botContext ?? bubble.textContent ?? undefined, rect });
  }, []);

  useEffect(() => {
    document.addEventListener('mouseup', onSelect);
    return () => document.removeEventListener('mouseup', onSelect);
  }, [onSelect]);

  const conversations = list?.conversations ?? [];

  /** the stored result is the truth; the live map only covers the states a row can't hold */
  const checkOf = (m: Message): CheckState | undefined =>
    m.check ? { status: 'done', result: m.check }
      : checkLive[m.id] ? { status: checkLive[m.id] } : undefined;

  if (!list) return <div className="grid h-full place-items-center"><Spinner size={26} /></div>;

  return (
    <div className="flex h-full">
      <aside className="flex w-72 shrink-0 flex-col border-r border-latte/70 bg-parchment/40">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="font-extrabold">{t('chats_title')}</h2>
          <NavLink to="/people" className="btn-ghost text-sm">＋ {t('new_chat')}</NavLink>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {conversations.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-cocoaSoft">{t('chats_empty')}</p>
          )}
          {conversations.map((c) => {
            const ch = list.characters[c.characterId] as Character | undefined;
            if (!ch) return null;
            return (
              <NavLink
                key={c.id} to={`/chats/${c.id}`}
                className={({ isActive }) =>
                  `mb-1 flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition ${isActive ? 'bg-terra/15' : 'hover:bg-latte/60'}`}
              >
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br text-xl ${ch.gradient}`}>{ch.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-extrabold">{ch.name}</div>
                  <div className="truncate text-xs text-cocoaSoft/80">
                    {c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </div>
                </div>
              </NavLink>
            );
          })}
        </div>
      </aside>

      <section className="relative flex min-w-0 flex-1 flex-col">
        {!conversationId ? (
          <div className="grid h-full place-items-center text-cocoaSoft">
            <div className="text-center">
              <div className="mb-2 text-4xl animate-glow">🦉</div>
              <p className="font-bold">{conversations.length ? t('chats_pick') : t('chats_empty')}</p>
              {conversations.length > 0 && <p className="mt-1 text-sm">{t('chats_pick_sub')}</p>}
              <button className="btn-primary mt-3" onClick={() => nav('/people')}>{t('new_chat')}</button>
            </div>
          </div>
        ) : !thread ? (
          <div className="grid h-full place-items-center"><Spinner size={26} /></div>
        ) : (
          <>
            <header className="border-b border-latte/70 bg-parchment/70 px-4 py-2.5 backdrop-blur">
              <div className="mx-auto flex w-full max-w-[720px] items-center gap-3">
              {thread.character && (
                <>
                  <span className={`grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br text-lg ${thread.character.gradient}`}>{thread.character.emoji}</span>
                  <div>
                    <div className="font-extrabold leading-4">{thread.character.name}</div>
                    <div className="text-xs text-cocoaSoft">
                      {thread.character.level} · {typing ? <span className="text-terraDeep">{t('typing')}…</span> : thread.character.tagline}
                    </div>
                  </div>
                </>
              )}
              <button
                className="btn-ghost ml-auto text-sm"
                title={`${t('layout')}: ${layout === 'split' ? t('layout_split') : t('layout_list')}`}
                onClick={() => setLayout(layout === 'split' ? 'list' : 'split')}
              >⇄</button>
              <button
                className="btn-ghost text-sm"
                title={t('delete_chat')}
                onClick={() => {
                  if (!confirm(t('delete_chat') + '?')) return;
                  api.deleteChat(conversationId).then(() => { qc.invalidateQueries({ queryKey: ['conversations'] }); nav('/chats'); });
                }}
              >🗑</button>
              </div>
            </header>

            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <div className="mx-auto w-full max-w-[720px] space-y-2.5">
                {thread.hasMore && (
                  <button className="btn-ghost mx-auto block text-xs" disabled={older.isPending} onClick={() => {
                    const first = thread.messages[0];
                    // `before` is a createdAt cursor, not a message id — the backend filters by timestamp
                    if (first) older.mutate(first.createdAt);
                  }}>{older.isPending ? <Spinner size={14} /> : '↑ …'}</button>
                )}
                {thread.messages.map((m) => (
                  <Bubble
                    key={bubbleKey(m.sender, m.requestId, m.id)} m={m} char={thread.character} layout={layout}
                    check={checkOf(m)}
                    onOpenCheck={(rect, result) => setCheckPopup({ rect, result })}
                  />
                ))}
                {Object.entries(thread.outgoing).map(([requestId, text]) => text && (
                  <Bubble key={bubbleKey('user', requestId)} outgoing text={text} layout={layout} />
                ))}
                {Object.entries(thread.drafts).map(([requestId, text]) => text && (
                  <Bubble key={bubbleKey('bot', requestId)} char={thread.character} streaming text={text} layout={layout} />
                ))}
                {typing && !Object.values(thread.drafts).some(Boolean) && (
                  <div className="flex items-center gap-1.5 px-1 text-cocoaSoft">
                    <span className="dot h-2 w-2 animate-blink rounded-full bg-terra/70" style={{ animationDelay: '0ms' }} />
                    <span className="dot h-2 w-2 animate-blink rounded-full bg-terra/70" style={{ animationDelay: '180ms' }} />
                    <span className="dot h-2 w-2 animate-blink rounded-full bg-terra/70" style={{ animationDelay: '360ms' }} />
                    <span className="ml-1 text-xs italic">{thread.character?.name} {t('typing')}…</span>
                  </div>
                )}
              </div>
            </div>

            <Composer
              onSend={(text) => send.mutate({ text, requestId: rid() })}
              busy={send.isPending}
              nativeLang={user?.nativeLang ?? 'ru'}
              targetLang={thread.character?.lang ?? user?.targetLang ?? 'en'}
              level={thread.character?.level}
            />
            {popup && (
              <ExplainPopup
                text={popup.text}
                context={popup.context}
                rect={popup.rect}
                onClose={closeExplain}
              />
            )}
            {checkPopup && (
              <CheckPopup check={checkPopup.result} rect={checkPopup.rect} onClose={closeCheckPopup} />
            )}
            {isFetching && <div className="pointer-events-none absolute right-4 top-16 opacity-40"><Spinner size={16} /></div>}
          </>
        )}
      </section>
    </div>
  );
}

type ChatLayout = 'split' | 'list';

function Bubble({
  m, char, text, streaming, outgoing, layout, check, onOpenCheck,
}: {
  m?: Message; char?: Character; text?: string; streaming?: boolean; outgoing?: boolean; layout: ChatLayout;
  check?: CheckState; onOpenCheck?: (rect: DOMRect, result: AiCheckRes) => void;
}) {
  const t = useT();
  const mine = m?.sender === 'user' || !!outgoing;
  const system = m?.sender === 'system';
  const body = text ?? m?.text ?? '';
  const time = m?.createdAt ? new Date(m.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : null;
  if (system) {
    return (
      <div className="mx-auto max-w-[85%] text-center animate-rise">
        <div className="rounded-xl bg-honey/20 px-3 py-1.5 text-xs font-semibold text-cocoaSoft">{body}</div>
        {time && <div className="mt-0.5 text-[10px] text-cocoaSoft/60">{time}</div>}
      </div>
    );
  }
  const right = layout === 'split' && mine;
  return (
    <div className={`flex items-end gap-2 animate-rise ${right ? 'justify-end' : 'justify-start'} ${outgoing ? 'opacity-70' : ''}`}>
      {!mine && char && (
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br text-base ${char.gradient}`}>{char.emoji}</span>
      )}
      {layout === 'list' && mine && <span className="w-8 shrink-0" aria-hidden />}
      <div className={`flex max-w-[75%] flex-col gap-0.5 ${right ? 'items-end' : 'items-start'}`}>
        <div
          {...(!mine && { 'data-bot-text': '', 'data-bot-context': body })}
          className={`select-text whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed shadow-soft ${
            mine ? 'rounded-br-md bg-gradient-to-br from-terra to-terraDeep text-parchment'
                  : 'rounded-bl-md bg-parchment text-cocoa hover:shadow-lift'}`}
        >
          {body}
          {streaming && <span className="ml-0.5 inline-block h-4 w-[3px] animate-glow rounded bg-terra align-middle" />}
        </div>
        {(outgoing || time || (mine && check && check.status !== 'failed')) && (
          <span className="flex items-center gap-1.5 px-1 text-[10px] leading-4 tabular-nums text-cocoaSoft/60">
            {(time || outgoing) && <span>{time ?? t('sending')}</span>}
            {mine && check && check.status !== 'failed' && (
              <button
                className={`transition hover:opacity-70 ${SEV_STYLE[checkSeverity(check.result)]} ${check.status === 'pending' ? 'cursor-default' : ''}`}
                title={t('check_title')}
                onClick={(e) => { if (check.result) onOpenCheck?.(e.currentTarget.getBoundingClientRect(), check.result); }}
              >
                {check.status === 'pending' ? <><Spinner size={9} /> {t('check_pending')}</>
                  : check.result?.ok ? <>✓ {t('check_ok')}</>
                  : <>⚠ {t('check_issues')} · {check.result?.issues.length ?? 0}</>}
              </button>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

function Composer({ onSend, busy, nativeLang, targetLang, level }: {
  onSend: (text: string) => void; busy: boolean; nativeLang: string; targetLang: string; level?: CefrLevel;
}) {
  const t = useT();
  const [text, setText] = useState('');
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  const tr = useMutation({
    mutationFn: (source: string) => api.translate({ text: source, nativeLang, targetLang, level }),
    onError: reportApiError,
  });

  function submit() {
    const v = text.trim();
    if (!v || busy) return;
    setText('');
    onSend(v);
    ref.current?.focus();
  }

  function closeTranslate() {
    setOpen(false);
    setDraft('');
    tr.reset();
  }

  function insert(res: AiTranslateRes) {
    setText((prev) => (prev.trim() ? `${prev.trim()} ${res.translation}` : res.translation));
    closeTranslate();
    ref.current?.focus();
  }

  // the box fits its content, including a translation dropped into it from outside
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(160, el.scrollHeight)}px`;
  }, [text]);

  return (
    <div className="border-t border-latte/70 bg-parchment/70 p-3 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[720px] items-end gap-2">
        <textarea
          ref={ref}
          className="input max-h-40 min-h-[44px] flex-1 resize-none"
          placeholder={t('type_here')}
          value={text}
          rows={1}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
          }}
        />
        <button
          className="btn-ghost h-[44px] w-[44px] shrink-0 p-0"
          title={t('translate_title')}
          onClick={() => setOpen(true)}
        >🌐</button>
        <button className="btn-primary h-[44px]" disabled={!text.trim() || busy} onClick={submit}>
          {busy ? <Spinner size={16} /> : <>➤ <span className="ml-1 hidden sm:inline">{t('send')}</span></>}
        </button>
      </div>

      <Modal open={open} onClose={closeTranslate}>
        <h3 className="mb-1 text-lg font-extrabold">🌐 {t('translate_title')}</h3>
        <p className="mb-3 text-xs leading-relaxed text-cocoaSoft">{t('translate_hint')}</p>
        <textarea
          className="input min-h-[88px] resize-none"
          placeholder={t('translate_from')}
          value={draft}
          rows={3}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && draft.trim()) { e.preventDefault(); tr.mutate(draft.trim()); }
          }}
        />
        {tr.data && (
          <div className="mt-3 rounded-xl bg-latte/60 px-3 py-2.5">
            <div className="text-xs font-bold uppercase tracking-wide text-cocoaSoft/70">{t('translation')}</div>
            <div className="mt-0.5 text-[15px] font-semibold leading-relaxed">{tr.data.translation}</div>
            {!!tr.data.note && <div className="mt-1 text-xs italic leading-relaxed text-cocoaSoft">{tr.data.note}</div>}
            <button className="btn-warm mt-2 w-full" onClick={() => insert(tr.data)}>📥 {t('translate_insert')}</button>
          </div>
        )}
        <div className="mt-3 flex justify-end gap-2">
          <button className="btn-ghost" onClick={closeTranslate}>{t('cancel')}</button>
          <button className="btn-primary" disabled={!draft.trim() || tr.isPending} onClick={() => tr.mutate(draft.trim())}>
            {tr.isPending ? <Spinner size={16} /> : t('translate_do')}
          </button>
        </div>
      </Modal>
    </div>
  );
}
