import { Injectable, inject } from '@angular/core';
import {
  QueryConstraint,
  QueryDocumentSnapshot,
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  where,
} from 'firebase/firestore';
import { Callables } from '../../core/firebase/callable';
import { FIRESTORE } from '../../core/firebase/firebase';
import { Order, toOrder } from '../orders/orders.models';
import { Chat, toChat } from '../support/support.models';
import {
  Customer,
  CustomerAddress,
  CustomerAuth,
  CustomerQuery,
  toAddress,
  toCustomer,
} from './customers.models';

export const PAGE_SIZE = 25;

export interface CustomerPage {
  customers: Customer[];
  /** Pass back to load the next page; null on the last one. */
  cursor: QueryDocumentSnapshot | null;
}

@Injectable({ providedIn: 'root' })
export class CustomersApi {
  private readonly db = inject(FIRESTORE);
  private readonly callables = inject(Callables);

  /** Newest sign-ups first (profiles without createdAt aren't listed, but are searchable). */
  async page(cursor: QueryDocumentSnapshot | null): Promise<CustomerPage> {
    const s = await getDocs(
      query(
        collection(this.db, 'users'),
        orderBy('createdAt', 'desc'),
        ...(cursor ? [startAfter(cursor)] : []),
        limit(PAGE_SIZE),
      ),
    );
    return {
      customers: s.docs.map((d) => toCustomer(d.id, d.data())),
      cursor: s.docs.length === PAGE_SIZE ? s.docs[s.docs.length - 1] : null,
    };
  }

  /** At most 25 matches; see parseCustomerQuery for what's searched. */
  async search(q: CustomerQuery): Promise<Customer[]> {
    const users = collection(this.db, 'users');
    const run = async (...c: QueryConstraint[]) =>
      (await getDocs(query(users, ...c, limit(PAGE_SIZE)))).docs.map((d) =>
        toCustomer(d.id, d.data()),
      );
    switch (q.kind) {
      case 'none':
        return [];
      case 'phone':
        return run(where('phone', '==', q.value));
      case 'email':
        return run(where('email', '==', q.value));
      case 'name':
        return run(
          where('fullName', '>=', q.value),
          where('fullName', '<=', q.value + ''),
          orderBy('fullName'),
        );
      case 'uid': {
        const s = await getDoc(doc(users, q.value));
        return s.exists() ? [toCustomer(s.id, s.data())] : [];
      }
      case 'order': {
        // Order ids are UUIDs; the short number is their first block.
        const s = await getDocs(
          query(
            collection(this.db, 'orders'),
            where(documentId(), '>=', q.value),
            where(documentId(), '<', q.value + 'g'),
            limit(1),
          ),
        );
        const uid = s.docs[0]?.get('userId') as string | undefined;
        if (!uid) return [];
        const u = await getDoc(doc(users, uid));
        return u.exists() ? [toCustomer(u.id, u.data())] : [];
      }
    }
  }

  listen(uid: string, next: (c: Customer | null) => void, fail: (e: Error) => void): () => void {
    return onSnapshot(
      doc(this.db, 'users', uid),
      (s) => next(s.exists() ? toCustomer(s.id, s.data()) : null),
      fail,
    );
  }

  async addresses(uid: string): Promise<CustomerAddress[]> {
    const s = await getDocs(collection(this.db, 'users', uid, 'addresses'));
    return s.docs
      .map((d) => toAddress(d.id, d.data()))
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  }

  async orders(uid: string): Promise<Order[]> {
    const s = await getDocs(
      query(
        collection(this.db, 'orders'),
        where('userId', '==', uid),
        orderBy('placedAt', 'desc'),
        limit(50),
      ),
    );
    return s.docs.map((d) => toOrder(d.id, d.data()));
  }

  async chats(uid: string): Promise<Chat[]> {
    const s = await getDocs(
      query(
        collection(this.db, 'supportChats'),
        where('userId', '==', uid),
        orderBy('updatedAt', 'desc'),
        limit(20),
      ),
    );
    return s.docs.map((d) => toChat(d.id, d.data()));
  }

  async auth(uid: string): Promise<CustomerAuth> {
    const a = await this.callables.call<
      unknown,
      Omit<CustomerAuth, 'createdAt' | 'lastSignInAt'> & {
        createdAt?: string | null;
        lastSignInAt?: string | null;
      }
    >('adminGetCustomerAuth', { uid });
    const date = (s?: string | null) => (s ? new Date(s) : null);
    return { ...a, createdAt: date(a.createdAt), lastSignInAt: date(a.lastSignInAt) };
  }

  setBlocked(uid: string, blocked: boolean, reason: string) {
    return this.callables.call<unknown, { ok: true }>('adminSetCustomerBlocked', {
      uid,
      blocked,
      reason,
    });
  }

  push(uid: string, title: string, body: string) {
    return this.callables.call<unknown, { ok: true }>('adminPushCustomer', { uid, title, body });
  }
}
