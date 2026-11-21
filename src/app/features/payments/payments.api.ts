import { Injectable, inject } from '@angular/core';
import { Timestamp, collection, limit, orderBy, query, where } from 'firebase/firestore';
import { Callables } from '../../core/firebase/callable';
import { FIRESTORE } from '../../core/firebase/firebase';
import { Live, liveQuery } from '../../core/firebase/live';
import { Refund, toRefund } from '../orders/orders.api';

export type IntentStatus =
  'created' | 'completed' | 'failed' | 'expired' | 'needs_review' | 'refunded' | 'dismissed';

export interface Intent {
  id: string;
  userId: string | null;
  amountPaise: number;
  paymentMethod: string;
  status: IntentStatus;
  transactionId: string | null;
  orderId: string | null;
  failureReason: string | null;
  refundedPaise: number;
  resolutionNote: string | null;
  createdAt: Timestamp | null;
}

export interface RefundRow extends Refund {
  orderId: string | null;
  intentId: string | null;
}

export const INTENT_META: Record<IntentStatus, { label: string; color: string }> = {
  created: { label: 'Started', color: 'default' },
  completed: { label: 'Paid', color: 'success' },
  failed: { label: 'Failed', color: 'default' },
  expired: { label: 'Abandoned', color: 'default' },
  needs_review: { label: 'Needs review', color: 'error' },
  refunded: { label: 'Refunded', color: 'purple' },
  dismissed: { label: 'Resolved', color: 'blue' },
};

export function toIntent(id: string, d: Record<string, unknown>): Intent {
  return {
    id,
    userId: (d['userId'] as string | null) ?? null,
    amountPaise: Number(d['amountPaise']) || 0,
    paymentMethod: (d['paymentMethod'] as string) ?? '',
    status: (d['status'] as IntentStatus) ?? 'created',
    transactionId: (d['transactionId'] as string | null) ?? null,
    orderId: (d['orderId'] as string | null) ?? null,
    failureReason: (d['failureReason'] as string | null) ?? null,
    refundedPaise: Number(d['refundedPaise']) || 0,
    resolutionNote: (d['resolutionNote'] as string | null) ?? null,
    createdAt: d['createdAt'] instanceof Timestamp ? d['createdAt'] : null,
  };
}

@Injectable({ providedIn: 'root' })
export class PaymentsApi {
  private readonly db = inject(FIRESTORE);
  private readonly callables = inject(Callables);

  /** Injection context only. Oldest first: the one waiting longest on top. */
  watchNeedsReview(): Live<Intent[]> {
    return liveQuery(
      query(
        collection(this.db, 'paymentIntents'),
        where('status', '==', 'needs_review'),
        orderBy('createdAt', 'asc'),
      ),
      (s) => s.docs.map((d) => toIntent(d.id, d.data())),
    );
  }

  /** Injection context only. */
  watchRefunds(): Live<RefundRow[]> {
    return liveQuery(
      query(collection(this.db, 'refunds'), orderBy('createdAt', 'desc'), limit(100)),
      (s) =>
        s.docs.map((d) => ({
          ...toRefund(d.id, d.data()),
          orderId: (d.get('orderId') as string | null) ?? null,
          intentId: (d.get('intentId') as string | null) ?? null,
        })),
    );
  }

  /** Injection context only. Online payment attempts of the last 30 days. */
  watchIntents(): Live<Intent[]> {
    const from = Timestamp.fromMillis(Date.now() - 30 * 86_400_000);
    return liveQuery(
      query(
        collection(this.db, 'paymentIntents'),
        where('createdAt', '>=', from),
        orderBy('createdAt', 'desc'),
        limit(300),
      ),
      (s) => s.docs.map((d) => toIntent(d.id, d.data())),
    );
  }

  resolve(intentId: string, action: 'refund' | 'dismiss', note: string) {
    return this.callables.call<unknown, { status: string }>('adminResolveIntent', {
      intentId,
      action,
      note,
    });
  }

  refreshRefund(refundId: string) {
    return this.callables.call<unknown, { status: string }>('adminRefreshRefund', { refundId });
  }
}
