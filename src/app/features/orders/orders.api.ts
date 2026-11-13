import { Injectable, inject } from '@angular/core';
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { Callables } from '../../core/firebase/callable';
import { FIRESTORE } from '../../core/firebase/firebase';
import { Order, OrderEvent, OrderStatus, toOrder } from './orders.models';

export interface Customer {
  name: string | null;
  phone: string | null;
  email: string | null;
}

export interface Refund {
  id: string;
  amountPaise: number;
  reason: string;
  status: 'requesting' | 'requested' | 'succeeded' | 'failed';
  failureReason: string | null;
  createdAt: Timestamp | null;
  createdByEmail: string | null;
}

type Unsub = () => void;

@Injectable({ providedIn: 'root' })
export class OrdersApi {
  private readonly db = inject(FIRESTORE);
  private readonly callables = inject(Callables);

  /** Orders placed since `from`, newest first (cap 500 for the board). */
  listen(from: Date, next: (o: Order[]) => void, fail: (e: Error) => void): Unsub {
    return onSnapshot(
      query(
        collection(this.db, 'orders'),
        where('placedAt', '>=', Timestamp.fromDate(from)),
        orderBy('placedAt', 'desc'),
        limit(500),
      ),
      (s) => next(s.docs.map((d) => toOrder(d.id, d.data()))),
      fail,
    );
  }

  listenOrder(id: string, next: (o: Order | null) => void, fail: (e: Error) => void): Unsub {
    return onSnapshot(
      doc(this.db, 'orders', id),
      (s) => next(s.exists() ? toOrder(s.id, s.data()) : null),
      fail,
    );
  }

  listenEvents(id: string, next: (e: OrderEvent[]) => void): Unsub {
    return onSnapshot(
      query(collection(this.db, 'orders', id, 'events'), orderBy('createdAt', 'asc')),
      (s) =>
        next(
          s.docs.map((d) => ({
            id: d.id,
            status: d.get('status'),
            createdAt: d.get('createdAt') instanceof Timestamp ? d.get('createdAt') : null,
            by: d.get('by') ?? null,
            note: d.get('note') ?? null,
          })),
        ),
      () => next([]),
    );
  }

  /** Refunds can only be read by finance / ops; others get an empty list. */
  listenRefunds(orderId: string, next: (r: Refund[]) => void): Unsub {
    return onSnapshot(
      query(collection(this.db, 'refunds'), where('orderId', '==', orderId)),
      (s) =>
        next(
          s.docs
            .map((d) => toRefund(d.id, d.data()))
            .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0)),
        ),
      () => next([]),
    );
  }

  async customer(userId: string | null): Promise<Customer | null> {
    if (!userId) return null;
    try {
      const s = await getDoc(doc(this.db, 'users', userId));
      if (!s.exists()) return null;
      return {
        name: s.get('fullName') ?? null,
        phone: s.get('phone') ?? null,
        email: s.get('email') ?? null,
      };
    } catch {
      return null;
    }
  }

  updateStatus(input: {
    orderId: string;
    status: OrderStatus;
    reason?: string;
    riderName?: string;
    riderPhone?: string;
  }): Promise<{ ok: true; refund?: { refundId: string; status: string } }> {
    return this.callables.call('adminUpdateOrderStatus', input);
  }

  refund(orderId: string, amountPaise: number, reason: string) {
    return this.callables.call<unknown, { refundId: string; status: string }>(
      'adminRefundPayment',
      {
        orderId,
        amountPaise,
        reason,
      },
    );
  }

  refreshRefund(refundId: string) {
    return this.callables.call<unknown, { status: string }>('adminRefreshRefund', { refundId });
  }
}

export function toRefund(id: string, d: Record<string, unknown>): Refund {
  return {
    id,
    amountPaise: Number(d['amountPaise']) || 0,
    reason: (d['reason'] as string) ?? '',
    status: (d['status'] as Refund['status']) ?? 'requesting',
    failureReason: (d['failureReason'] as string | null) ?? null,
    createdAt: d['createdAt'] instanceof Timestamp ? d['createdAt'] : null,
    createdByEmail: (d['createdByEmail'] as string | null) ?? null,
  };
}

export const REFUND_META: Record<Refund['status'], { label: string; color: string }> = {
  requesting: { label: 'Sending to PayU', color: 'default' },
  requested: { label: 'With PayU', color: 'processing' },
  succeeded: { label: 'Refunded', color: 'success' },
  failed: { label: 'Failed', color: 'error' },
};
