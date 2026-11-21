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
import { Claim, toClaim } from '../claims/claims.models';
import { Order, toOrder } from '../orders/orders.models';
import { Intent, toIntent } from '../payments/payments.api';
import { ReturnDoc, toReturn } from '../returns/returns.models';
import { Chat, toChat } from '../support/support.models';
import {
  CartLine,
  Consent,
  Customer,
  CustomerAddress,
  CustomerAuth,
  CustomerQuery,
  Favourite,
  InboxEntry,
  SellerRating,
  WalletEntry,
  newestFirst,
  ratingsOf,
  toAddress,
  toCartLine,
  toConsent,
  toCustomer,
  toFavourite,
  toInboxEntry,
  toWalletEntry,
} from './customers.models';

/** A product's name and variant labels, for cart and favourites. */
export interface ProductName {
  name: string;
  variants: Record<string, string>;
}

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

  /** The newest 50 orders, and the seller ratings given on them. */
  async orders(uid: string): Promise<{ orders: Order[]; ratings: SellerRating[] }> {
    const s = await getDocs(
      query(
        collection(this.db, 'orders'),
        where('userId', '==', uid),
        orderBy('placedAt', 'desc'),
        limit(50),
      ),
    );
    const orders = s.docs.map((d) => toOrder(d.id, d.data()));
    const ratings = s.docs.flatMap((d, i) =>
      ratingsOf(
        d.id,
        d.data(),
        Object.fromEntries(orders[i].items.map((it) => [it.sellerId, it.sellerName])),
      ),
    );
    return { orders, ratings };
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

  /** The newest wallet history entries. */
  async wallet(uid: string): Promise<WalletEntry[]> {
    const s = await getDocs(
      query(collection(this.db, 'users', uid, 'wallet'), orderBy('at', 'desc'), limit(30)),
    );
    return s.docs.map((d) => toWalletEntry(d.id, d.data()));
  }

  /**
   * Finance: add store credit (goodwill, a problem found after the 2-hour
   * window, a cash order paid back). One requestId per dialog, so a double
   * click or retry can't credit twice.
   */
  creditWallet(uid: string, amountPaise: number, reason: string, requestId: string) {
    return this.callables.call<unknown, { ok: true }>('adminCreditWallet', {
      uid,
      amountPaise,
      reason,
      requestId,
    });
  }

  async cart(uid: string): Promise<CartLine[]> {
    const s = await getDocs(collection(this.db, 'users', uid, 'cart'));
    return newestFirst(
      s.docs.map((d) => toCartLine(d.id, d.data())),
      (l) => l.updatedAt,
    );
  }

  async favourites(uid: string): Promise<Favourite[]> {
    const s = await getDocs(collection(this.db, 'users', uid, 'favourites'));
    return newestFirst(
      s.docs.map((d) => toFavourite(d.id, d.data())),
      (f) => f.createdAt,
    );
  }

  /** The newest entries of the app's notification inbox. */
  async inbox(uid: string): Promise<InboxEntry[]> {
    const s = await getDocs(
      query(collection(this.db, 'users', uid, 'notifications'), orderBy('at', 'desc'), limit(30)),
    );
    return s.docs.map((d) => toInboxEntry(d.id, d.data()));
  }

  async consents(uid: string): Promise<Consent[]> {
    const s = await getDocs(collection(this.db, 'users', uid, 'consents'));
    return newestFirst(
      s.docs.map((d) => toConsent(d.id, d.data())),
      (c) => c.acceptedAt,
    );
  }

  // The next three filter on userId only (no composite index) and sort here.

  /** "Report a problem" claims (ops, support, finance). */
  async claims(uid: string): Promise<Claim[]> {
    const s = await getDocs(
      query(collection(this.db, 'orderIssues'), where('userId', '==', uid), limit(50)),
    );
    return newestFirst(
      s.docs.map((d) => toClaim(d.id, d.data())),
      (c) => c.createdAt,
    );
  }

  /** Automatic return pickups (ops, support, finance). */
  async returns(uid: string): Promise<ReturnDoc[]> {
    const s = await getDocs(
      query(collection(this.db, 'returns'), where('userId', '==', uid), limit(50)),
    );
    return newestFirst(
      s.docs.map((d) => toReturn(d.id, d.data())),
      (r) => r.createdAt,
    );
  }

  /** Online payment attempts, paid or not. */
  async payments(uid: string): Promise<Intent[]> {
    const s = await getDocs(
      query(collection(this.db, 'paymentIntents'), where('userId', '==', uid), limit(50)),
    );
    return newestFirst(
      s.docs.map((d) => toIntent(d.id, d.data())),
      (i) => i.createdAt,
    );
  }

  /** A service area's name, or null when it's gone. */
  async areaName(id: string): Promise<string | null> {
    const s = await getDoc(doc(this.db, 'serviceAreas', id));
    return s.exists() ? ((s.get('name') as string | undefined) ?? id) : null;
  }

  /** Names for product ids (missing or deleted products are left out). */
  async productNames(ids: string[]): Promise<Map<string, ProductName>> {
    const unique = [...new Set(ids.filter(Boolean))];
    const out = new Map<string, ProductName>();
    for (let i = 0; i < unique.length; i += 30) {
      const s = await getDocs(
        query(collection(this.db, 'products'), where(documentId(), 'in', unique.slice(i, i + 30))),
      );
      for (const d of s.docs) {
        const variants = Array.isArray(d.get('variants'))
          ? (d.get('variants') as { id?: unknown; label?: unknown }[])
          : [];
        out.set(d.id, {
          name: (d.get('name') as string | undefined) ?? d.id,
          variants: Object.fromEntries(
            variants
              .filter((v) => typeof v.id === 'string')
              .map((v) => [v.id as string, typeof v.label === 'string' ? v.label : '']),
          ),
        });
      }
    }
    return out;
  }

  push(uid: string, title: string, body: string) {
    return this.callables.call<unknown, { ok: true }>('adminPushCustomer', { uid, title, body });
  }
}
