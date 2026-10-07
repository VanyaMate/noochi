import { and, desc, eq, inArray, lt } from 'drizzle-orm';
import {
  AppError, RemoteAppError, S,
  type CefrLevel,
  type ChatEvent, type ChatOpenReq, type ChatHistoryReq, type ChatSendReq, type ChatDeleteReq,
} from '@noochi/shared';
import {
  characters, conversations, messages,
  fetchPublicUser, toCharacter, toConversation, toMessage,
} from '@noochi/db';
import { newId, type Stack, type HandlerMap } from '@noochi/platform';

export function chatHandlers(stack: Stack): HandlerMap {
  const { db, bus } = stack;

  const emit = (conversationId: string, ev: ChatEvent) => bus.publish(`evt.chat.${conversationId}`, ev);

  async function ownConversation(userId: string, conversationId: string) {
    const rows = await db.select().from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId))).limit(1);
    if (!rows.length) throw new AppError('NOT_FOUND', 'No such conversation');
    return rows[0];
  }

  /** A proofread the character's reply did not carry; it lands after the answer instead of delaying it. */
  async function checkAfterReply(
    conversationId: string, messageId: string, userId: string,
    text: string, nativeLang: string, targetLang: string,
  ) {
    try {
      const result = await bus.request(S.ai.check, { userId, text, nativeLang, targetLang }, 60_000);
      await db.update(messages).set({ check: result }).where(eq(messages.id, messageId));
      emit(conversationId, { type: 'check', conversationId, messageId, status: 'done', result });
    } catch (e) {
      console.log(`[noochi:chat] deferred check failed: ${e instanceof Error ? e.message : String(e)}`);
      emit(conversationId, { type: 'check', conversationId, messageId, status: 'failed' });
    }
  }

  return {
    [S.chat.conversations]: async ({ userId }: { userId: string }) => {
      const convs = await db.select().from(conversations)
        .where(eq(conversations.userId, userId))
        .orderBy(desc(conversations.lastMessageAt));
      const charIds = [...new Set(convs.map((c) => c.characterId))];
      const chars = charIds.length
        ? await db.select().from(characters).where(inArray(characters.id, charIds))
        : [];
      return {
        conversations: convs.map(toConversation),
        characters: Object.fromEntries(chars.map((c) => [c.id, toCharacter(c)])),
      };
    },

    [S.chat.open]: async (req: ChatOpenReq) => {
      const charRows = await db.select().from(characters).where(eq(characters.id, req.characterId)).limit(1);
      if (!charRows.length) throw new AppError('NOT_FOUND', 'No such character');
      const character = toCharacter(charRows[0]);
      if (!character.isPublic && character.ownerId !== req.userId) throw new AppError('FORBIDDEN', 'Private character');

      let conv = (await db.select().from(conversations)
        .where(and(eq(conversations.userId, req.userId), eq(conversations.characterId, req.characterId)))
        .limit(1))[0];

      if (!conv) {
        conv = {
          id: newId(), userId: req.userId, characterId: req.characterId,
          createdAt: new Date(), updatedAt: new Date(), lastMessageAt: new Date(),
        };
        await db.insert(conversations).values(conv);
        const welcome = {
          id: newId(), conversationId: conv.id, sender: 'bot',
          characterId: req.characterId, text: character.welcome, requestId: null,
          createdAt: new Date(),
        };
        await db.insert(messages).values(welcome);
      }

      const hist = await db.select().from(messages)
        .where(eq(messages.conversationId, conv.id)).orderBy(messages.createdAt).limit(100);
      return { conversation: toConversation(conv), character, messages: hist.map(toMessage) };
    },

    [S.chat.history]: async (req: ChatHistoryReq) => {
      await ownConversation(req.userId, req.conversationId);
      const where = req.before
        ? and(eq(messages.conversationId, req.conversationId), lt(messages.createdAt, new Date(req.before)))
        : eq(messages.conversationId, req.conversationId);
      const rows = await db.select().from(messages).where(where)
        .orderBy(desc(messages.createdAt)).limit(req.limit + 1);
      const hasMore = rows.length > req.limit;
      return { messages: rows.slice(0, req.limit).reverse().map(toMessage), hasMore };
    },

    [S.chat.send]: async (req: ChatSendReq) => {
      const conv = await ownConversation(req.userId, req.conversationId);

      // idempotency: same requestId already stored
      const dupes = await db.select().from(messages)
        .where(and(eq(messages.conversationId, req.conversationId), eq(messages.requestId, req.requestId)))
        .limit(1);
      if (dupes.length) return { userMessage: toMessage(dupes[0]) };

      // daily message limit (billing throws LIMIT_MESSAGES when over)
      await bus.request(S.billing.increment, { userId: req.userId, kind: 'messages' });

      const userMsg = {
        id: newId(), conversationId: conv.id, sender: 'user' as const,
        characterId: null, text: req.text, requestId: req.requestId, check: null, createdAt: new Date(),
      };
      await db.insert(messages).values(userMsg);
      await db.update(conversations).set({ lastMessageAt: userMsg.createdAt, updatedAt: userMsg.createdAt })
        .where(eq(conversations.id, conv.id));
      emit(conv.id, { type: 'message', conversationId: conv.id, message: toMessage(userMsg) });
      emit(conv.id, { type: 'typing', conversationId: conv.id, characterId: conv.characterId, on: true });

      // the proofread is attempted inside the reply below; when the model skips it, a second call covers it
      emit(conv.id, { type: 'check', conversationId: conv.id, messageId: userMsg.id, status: 'pending' });

      try {
        const me = await fetchPublicUser(db, req.userId);
        const nativeLang = me?.nativeLang ?? 'ru';
        const targetLang = me?.targetLang ?? 'en';
        const history = await db.select().from(messages)
          .where(eq(messages.conversationId, conv.id)).orderBy(desc(messages.createdAt)).limit(25);
        const { text: replyText, check } = await bus.request(S.ai.reply, {
          userId: req.userId,
          characterId: conv.characterId,
          conversationId: conv.id,
          requestId: req.requestId,
          text: req.text,
          history: history.map(toMessage).reverse()
            .filter((m) => m.sender !== 'system')
            .slice(0, -1) // drop the message we just added; it goes as `text`
            .map((m) => ({ sender: m.sender, text: m.text })),
          nativeLang,
          targetLang,
        }, 90_000);

        const botMsg = {
          id: newId(), conversationId: conv.id, sender: 'bot' as const,
          characterId: conv.characterId, text: replyText, requestId: req.requestId, check: null, createdAt: new Date(),
        };
        await db.insert(messages).values(botMsg);
        await db.update(conversations).set({ lastMessageAt: botMsg.createdAt, updatedAt: botMsg.createdAt })
          .where(eq(conversations.id, conv.id));
        emit(conv.id, { type: 'message', conversationId: conv.id, message: toMessage(botMsg) });

        if (check) {
          await db.update(messages).set({ check }).where(eq(messages.id, userMsg.id));
          emit(conv.id, { type: 'check', conversationId: conv.id, messageId: userMsg.id, status: 'done', result: check });
        } else {
          // most persona replies come back without the machine block — proofread in a second call,
          // started only now so the extra completion never sits between the user and the answer
          void checkAfterReply(conv.id, userMsg.id, req.userId, req.text, nativeLang, targetLang);
        }
      } catch (e) {
        emit(conv.id, { type: 'typing', conversationId: conv.id, characterId: conv.characterId, on: false });
        emit(conv.id, { type: 'check', conversationId: conv.id, messageId: userMsg.id, status: 'failed' });
        const code = e instanceof RemoteAppError || e instanceof AppError ? e.code : 'INTERNAL';
        if (code === 'AI_KEY_MISSING') {
          const sys = {
            id: newId(), conversationId: conv.id, sender: 'system' as const,
            characterId: null, requestId: req.requestId, check: null, createdAt: new Date(),
            text: 'To keep chatting — add your OpenRouter key in Profile (free models work too).',
          };
          await db.insert(messages).values(sys);
          emit(conv.id, { type: 'message', conversationId: conv.id, message: toMessage(sys) });
        }
        throw e;
      }

      emit(conv.id, { type: 'typing', conversationId: conv.id, characterId: conv.characterId, on: false });
      return { userMessage: toMessage(userMsg) };
    },

    [S.chat.remove]: async (req: ChatDeleteReq) => {
      await ownConversation(req.userId, req.conversationId);
      await db.delete(conversations).where(eq(conversations.id, req.conversationId));
      return { ok: true } as const;
    },
  };
}
