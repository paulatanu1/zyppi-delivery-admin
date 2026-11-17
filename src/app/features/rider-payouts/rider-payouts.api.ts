import { Injectable, inject } from '@angular/core';
import {
  Timestamp,
  collection,
  collectionGroup,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { Callables } from '../../core/firebase/callable';
import { FIRESTORE } from '../../core/firebase/firebase';
import { Live, liveQuery } from '../../core/firebase/live';

export interface PayoutRequest {
  id: string;
  riderId: string;
  riderName: string;
  amountPaise: number;
  requestedAt: Timestamp | null;
}

export interface RiderBalance {
  id: string;
  name: string;
  phone: string;
  earningsBalancePaise: number;
  codBalancePaise: number;
  payout: { method: string; upiId?: string; last4?: string } | null;
}

@Injectable({ providedIn: 'root' })
export class RiderPayoutsApi {
  private readonly db = inject(FIRESTORE);
  private readonly callables = inject(Callables);

  /** Injection context only. Oldest request first. */
  watchRequests(): Live<PayoutRequest[]> {
    return liveQuery(
      query(
        collectionGroup(this.db, 'payouts'),
        where('status', '==', 'requested'),
        orderBy('requestedAt', 'asc'),
        limit(200),
      ),
      (s) =>
        s.docs
          // Sellers' payout requests share the collection name (sellers/{id}/payouts).
          .filter((d) => d.ref.parent.parent?.parent.id === 'riders')
          .map((d) => ({
            id: d.id,
            riderId: d.ref.parent.parent?.id ?? '',
            riderName: (d.get('riderName') as string) || 'Rider',
            amountPaise: Number(d.get('amountPaise')) || 0,
            requestedAt: d.get('requestedAt') instanceof Timestamp ? d.get('requestedAt') : null,
          })),
    );
  }

  /** Injection context only. Approved riders with money owed to them. */
  watchBalances(): Live<RiderBalance[]> {
    return liveQuery(
      query(collection(this.db, 'riders'), where('status', '==', 'approved'), limit(500)),
      (s) =>
        s.docs
          .map((d) => ({
            id: d.id,
            name: (d.get('fullName') as string) || 'Rider',
            phone: (d.get('phone') as string) || '',
            earningsBalancePaise: Number(d.get('earningsBalancePaise')) || 0,
            codBalancePaise: Number(d.get('codBalancePaise')) || 0,
            payout: null,
          }))
          .sort((a, b) => b.earningsBalancePaise - a.earningsBalancePaise),
    );
  }

  recordPayout(input: {
    riderId: string;
    amountPaise: number;
    method: 'upi' | 'bank' | 'cash';
    reference: string;
    payoutId?: string;
  }) {
    return this.callables.call<unknown, { ok: true }>('adminRecordPayout', input);
  }

  adjust(riderId: string, amountPaise: number, reason: string) {
    return this.callables.call<unknown, { ok: true }>('adminAdjustEarnings', {
      riderId,
      amountPaise,
      reason,
    });
  }
}

/** Earnings minus cash the rider still holds (same as the server). */
export function payable(earnings: number, cash: number): number {
  return Math.max(0, earnings - Math.max(0, cash));
}
