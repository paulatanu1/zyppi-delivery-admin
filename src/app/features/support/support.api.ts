import { Injectable, inject } from '@angular/core';
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Callables } from '../../core/firebase/callable';
import { FIRESTORE } from '../../core/firebase/firebase';
import { Live, liveQuery } from '../../core/firebase/live';
import { Chat, ChatMessage, KbEntry, toChat, toKbEntry, toMessage } from './support.models';

type Unsub = () => void;

export interface ChatCustomer {
  name: string;
  phone: string | null;
}

@Injectable({ providedIn: 'root' })
export class SupportApi {
  private readonly db = inject(FIRESTORE);
  private readonly callables = inject(Callables);

  /** Injection context only. Chats that need (or have) a person. */
  watchOpen(): Live<Chat[]> {
    return liveQuery(
      query(
        collection(this.db, 'supportChats'),
        where('status', 'in', ['waiting_agent', 'agent']),
        orderBy('updatedAt', 'desc'),
        limit(200),
      ),
      (s) => s.docs.map((d) => toChat(d.id, d.data())),
    );
  }

  /** Injection context only. The latest chats of any status (bot and closed included). */
  watchRecent(): Live<Chat[]> {
    return liveQuery(
      query(collection(this.db, 'supportChats'), orderBy('updatedAt', 'desc'), limit(60)),
      (s) => s.docs.map((d) => toChat(d.id, d.data())),
    );
  }

  listenChat(id: string, next: (c: Chat | null) => void, fail: (e: Error) => void): Unsub {
    return onSnapshot(
      doc(this.db, 'supportChats', id),
      (s) => next(s.exists() ? toChat(s.id, s.data()) : null),
      fail,
    );
  }

  listenMessages(
    chatId: string,
    next: (m: ChatMessage[]) => void,
    fail: (e: Error) => void,
  ): Unsub {
    return onSnapshot(
      query(
        collection(this.db, 'supportChats', chatId, 'messages'),
        orderBy('createdAt', 'asc'),
        limit(300),
      ),
      (s) => next(s.docs.map((d) => toMessage(d.id, d.data()))),
      fail,
    );
  }

  async customer(uid: string): Promise<ChatCustomer> {
    const s = await getDoc(doc(this.db, 'users', uid));
    return {
      name: (s.get('fullName') as string) || 'Customer',
      phone: (s.get('phone') as string | null) ?? null,
    };
  }

  /** Clears the team's unread count (the rules allow only this field). */
  markRead(chatId: string): Promise<void> {
    return updateDoc(doc(this.db, 'supportChats', chatId), { unreadByAgent: 0 });
  }

  reply(chatId: string, text: string) {
    return this.callables.call<unknown, { ok: true }>('adminReplySupport', { chatId, text });
  }

  close(chatId: string) {
    return this.callables.call<unknown, { ok: true }>('adminCloseSupport', { chatId });
  }

  /** Injection context only. */
  watchKb(): Live<KbEntry[]> {
    return liveQuery(collection(this.db, 'supportKb'), (s) =>
      s.docs
        .map((d) => toKbEntry(d.id, d.data()))
        .sort((a, b) => a.title.en.localeCompare(b.title.en)),
    );
  }

  /** Re-embeds the questions on the server: can take ~30 s on a cold start. */
  saveKb(e: Omit<KbEntry, 'updatedAt'>) {
    return this.callables.call<unknown, { id: string; created: boolean }>('adminSaveKbEntry', e);
  }

  deleteKb(id: string) {
    return this.callables.call<unknown, { ok: true }>('adminDeleteKbEntry', { id });
  }
}
