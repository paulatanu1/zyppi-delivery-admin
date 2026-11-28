import { Injectable, inject } from '@angular/core';
import {
  Timestamp,
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { getDownloadURL, ref } from 'firebase/storage';
import { Callables } from '../../core/firebase/callable';
import { FIRESTORE, STORAGE } from '../../core/firebase/firebase';
import { Live, liveQuery } from '../../core/firebase/live';
import { Adjustment, Listing, Plan, Seller, toListing, toPlan, toSeller } from './sellers.models';

export type SellerReviewAction = 'approve' | 'reject' | 'request_changes' | 'suspend' | 'reinstate';

export interface SellerEvent {
  id: string;
  type: string;
  note: string | null;
  at: Timestamp | null;
}

export interface LedgerRow {
  id: string;
  type: string;
  orderId: string | null;
  amountPaise: number;
  status: string;
  reason: string | null;
  at: Timestamp | null;
}

export interface SellerPayoutRequest {
  id: string;
  sellerId: string;
  payablePaise: number;
  duesDeductedPaise: number;
  requestedAt: Timestamp | null;
}

export interface ProductRequest {
  id: string;
  sellerId: string;
  sellerName: string;
  kind: 'new' | 'edit';
  productId: string | null;
  payload: {
    name: string;
    description: string;
    categoryId: string;
    imageUrl: string | null;
    brand: string | null;
    variants: { label: string; mrpPaise: number; gtin: string | null }[];
    /** Raw details map: product-requests/request-details.ts reads it. */
    details: unknown;
  };
  /** A sub-category the seller asked for; created on approval. */
  suggestedSubcategory: string | null;
  status: string;
  at: Timestamp | null;
}

const ts = (v: unknown) => (v instanceof Timestamp ? v : null);

/** Admin side of the marketplace (zyppi-APP functions/src/marketplace). */
@Injectable({ providedIn: 'root' })
export class SellersApi {
  private readonly db = inject(FIRESTORE);
  private readonly storage = inject(STORAGE);
  private readonly callables = inject(Callables);

  /** Injection context only. Everyone except drafts and Zyppi itself. */
  watchAll(): Live<Seller[]> {
    return liveQuery(query(collection(this.db, 'sellers'), limit(1000)), (s) =>
      s.docs
        .filter((d) => d.id !== 'zyppi')
        .map((d) => toSeller(d.id, d.data()))
        .filter((x) => x.status !== 'draft'),
    );
  }

  listenSeller(id: string, next: (s: Seller | null) => void, fail: (e: Error) => void): () => void {
    return onSnapshot(
      doc(this.db, 'sellers', id),
      (s) => next(s.exists() ? toSeller(s.id, s.data()) : null),
      fail,
    );
  }

  listenEvents(id: string, next: (e: SellerEvent[]) => void): () => void {
    return onSnapshot(
      query(collection(this.db, 'sellers', id, 'events'), orderBy('at', 'desc'), limit(30)),
      (s) =>
        next(
          s.docs.map((d) => ({
            id: d.id,
            type: d.get('type'),
            note: d.get('note') ?? null,
            at: ts(d.get('at')),
          })),
        ),
      () => next([]),
    );
  }

  listenLedger(id: string, next: (r: LedgerRow[]) => void): () => void {
    return onSnapshot(
      query(collection(this.db, 'sellers', id, 'earnings'), orderBy('at', 'desc'), limit(50)),
      (s) =>
        next(
          s.docs.map((d) => ({
            id: d.id,
            type: d.get('type') ?? '',
            orderId: d.get('orderId') ?? null,
            amountPaise: Number(d.get('amountPaise')) || 0,
            status: d.get('status') ?? '',
            reason: d.get('reason') ?? null,
            at: ts(d.get('at')),
          })),
        ),
      () => next([]),
    );
  }

  listenListings(id: string, next: (l: Listing[]) => void): () => void {
    return onSnapshot(
      query(collection(this.db, 'listings'), where('sellerId', '==', id), limit(500)),
      (s) => next(s.docs.map((d) => toListing(d.id, d.data()))),
      () => next([]),
    );
  }

  /** Bank / UPI details (finance only by rules; null otherwise). */
  async payoutDetails(id: string): Promise<Record<string, string> | null> {
    try {
      const s = await getDoc(doc(this.db, 'sellers', id, 'private', 'payout'));
      return s.exists() ? (s.data() as Record<string, string>) : null;
    } catch {
      return null;
    }
  }

  docUrl(path: string): Promise<string> {
    return getDownloadURL(ref(this.storage, path));
  }

  review(sellerId: string, action: SellerReviewAction, reason: string) {
    return this.callables.call('adminReviewSeller', { sellerId, action, reason });
  }

  setTrusted(sellerId: string, trusted: boolean) {
    return this.callables.call('adminSetSellerTrusted', { sellerId, trusted });
  }

  setPlan(sellerId: string, planId: string) {
    return this.callables.call<unknown, { startsNow: boolean }>('adminSetSellerPlan', {
      sellerId,
      planId,
    });
  }

  saveListing(input: {
    sellerId: string;
    productId: string;
    variantId: string;
    areaId?: string;
    sellerPricePaise?: number;
    zyppiPricePaise?: number | null;
    addon?: Adjustment | null;
    isActive?: boolean;
    allowNegativeMargin?: boolean;
    reason?: string;
  }) {
    return this.callables.call<
      unknown,
      { pricePaise: number; payoutPaise: number; marginPaise: number }
    >('adminSaveListing', input);
  }

  recordPayout(input: {
    sellerId: string;
    payoutId?: string;
    amountPaise: number;
    duesDeductedPaise: number;
    method: 'upi' | 'bank';
    reference: string;
  }) {
    return this.callables.call('adminRecordSellerPayout', input);
  }

  recordFee(
    sellerId: string,
    amountPaise: number,
    method: 'upi' | 'bank' | 'cash',
    reference: string,
  ) {
    return this.callables.call('adminRecordSellerFee', {
      sellerId,
      amountPaise,
      method,
      reference,
    });
  }

  adjust(sellerId: string, amountPaise: number, reason: string) {
    return this.callables.call('adminAdjustSellerEarnings', { sellerId, amountPaise, reason });
  }

  // ---- Plans ------------------------------------------------------------------

  /** Injection context only. */
  watchPlans(): Live<Plan[]> {
    return liveQuery(query(collection(this.db, 'sellerPlans'), limit(100)), (s) =>
      s.docs.map((d) => toPlan(d.id, d.data())).sort((a, b) => a.months - b.months),
    );
  }

  async plans(): Promise<Plan[]> {
    const s = await getDocs(collection(this.db, 'sellerPlans'));
    return s.docs.map((d) => toPlan(d.id, d.data()));
  }

  savePlan(plan: Omit<Plan, 'id'> & { id?: string }) {
    return this.callables.call<unknown, { id: string }>('adminSaveSellerPlan', plan);
  }

  // ---- Payouts ----------------------------------------------------------------

  /** Injection context only. Sellers' open payout requests, oldest first. */
  watchPayoutRequests(): Live<SellerPayoutRequest[]> {
    return liveQuery(
      query(
        collectionGroup(this.db, 'payouts'),
        where('status', '==', 'requested'),
        orderBy('requestedAt', 'asc'),
        limit(200),
      ),
      (s) =>
        s.docs
          .filter((d) => d.ref.parent.parent?.parent.id === 'sellers')
          .map((d) => ({
            id: d.id,
            sellerId: d.ref.parent.parent?.id ?? '',
            payablePaise: Number(d.get('payablePaise')) || 0,
            duesDeductedPaise: Number(d.get('duesDeductedPaise')) || 0,
            requestedAt: ts(d.get('requestedAt')),
          })),
    );
  }

  // ---- Product requests -------------------------------------------------------

  /** Injection context only. Pending first, newest first. */
  watchProductRequests(): Live<ProductRequest[]> {
    return liveQuery(
      query(collection(this.db, 'productRequests'), orderBy('at', 'desc'), limit(300)),
      (s) =>
        s.docs.map((d) => {
          const p = (d.get('payload') ?? {}) as Record<string, unknown>;
          return {
            id: d.id,
            sellerId: d.get('sellerId') ?? '',
            sellerName: d.get('sellerName') ?? '',
            kind: d.get('kind') === 'edit' ? 'edit' : 'new',
            productId: d.get('productId') ?? null,
            payload: {
              name: (p['name'] as string) ?? '',
              description: (p['description'] as string) ?? '',
              categoryId: (p['categoryId'] as string) ?? '',
              imageUrl: (p['imageUrl'] as string | null) ?? null,
              brand: typeof p['brand'] === 'string' ? p['brand'] : null,
              variants: ((p['variants'] as Record<string, unknown>[] | undefined) ?? []).map(
                (v) => ({
                  label: String(v['label'] ?? ''),
                  mrpPaise: Number(v['mrpPaise']) || 0,
                  gtin: typeof v['gtin'] === 'string' ? v['gtin'] : null,
                }),
              ),
              details: p['details'] ?? null,
            },
            suggestedSubcategory:
              typeof d.get('suggestedSubcategory') === 'string'
                ? (d.get('suggestedSubcategory') as string)
                : null,
            status: d.get('status') ?? 'pending',
            at: ts(d.get('at')),
          };
        }),
    );
  }

  /**
   * `opts` applies to approvals of requests with a suggested sub-category:
   * create it (default) under a possibly tidied name, or skip it.
   */
  reviewProductRequest(
    requestId: string,
    action: 'approve' | 'reject',
    reason: string,
    opts: { createSubcategory?: boolean; subcategoryName?: string | null } = {},
  ) {
    return this.callables.call('adminReviewProductRequest', {
      requestId,
      action,
      reason,
      ...opts,
    });
  }
}
