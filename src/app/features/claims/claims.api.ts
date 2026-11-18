import { Injectable, inject } from '@angular/core';
import { collection, doc, getDoc, limit, orderBy, query, where } from 'firebase/firestore';
import { getDownloadURL, ref } from 'firebase/storage';
import { Callables } from '../../core/firebase/callable';
import { FIRESTORE, STORAGE } from '../../core/firebase/firebase';
import { Live, liveQuery } from '../../core/firebase/live';
import { Claim, ClaimResolution, toClaim } from './claims.models';

export interface ResolveResult {
  walletPaise: number;
  refundPaise: number;
  replacementOrderId: string | null;
  sellerDebitPaise: number;
}

/** "Report a problem" claims: the review queue and its callables. */
@Injectable({ providedIn: 'root' })
export class ClaimsApi {
  private readonly db = inject(FIRESTORE);
  private readonly storage = inject(STORAGE);
  private readonly fn = inject(Callables);

  /** Claims waiting for a decision, oldest first (first come, first served). */
  watchOpen(): Live<Claim[]> {
    return liveQuery(
      query(
        collection(this.db, 'orderIssues'),
        where('status', 'in', ['open', 'resolving']),
        orderBy('createdAt', 'desc'),
        limit(200),
      ),
      (s) => s.docs.map((d) => toClaim(d.id, d.data())).reverse(),
    );
  }

  /** Claims being handled by an automatic return pickup. */
  watchReturning(): Live<Claim[]> {
    return liveQuery(
      query(
        collection(this.db, 'orderIssues'),
        where('status', '==', 'returning'),
        orderBy('createdAt', 'desc'),
        limit(100),
      ),
      (s) => s.docs.map((d) => toClaim(d.id, d.data())),
    );
  }

  /** The latest decided claims. */
  watchReviewed(): Live<Claim[]> {
    return liveQuery(
      query(
        collection(this.db, 'orderIssues'),
        where('status', 'in', ['approved', 'rejected']),
        orderBy('createdAt', 'desc'),
        limit(100),
      ),
      (s) => s.docs.map((d) => toClaim(d.id, d.data())),
    );
  }

  /** How many claims the customer has made, all time (users/{uid}.claimStats). */
  async claimCount(uid: string): Promise<number> {
    const snap = await getDoc(doc(this.db, 'users', uid));
    return Number((snap.get('claimStats') as { count?: number } | undefined)?.count) || 0;
  }

  /** Signed URL of a private claim photo (storage.rules: ops, support, finance). */
  photoUrl(path: string): Promise<string> {
    return getDownloadURL(ref(this.storage, path));
  }

  resolve(
    issueId: string,
    resolution: ClaimResolution,
    amountPaise: number | null,
    sellerAtFault: boolean,
    note: string,
  ): Promise<ResolveResult> {
    return this.fn.call('adminResolveIssue', {
      issueId,
      resolution,
      ...(amountPaise != null && resolution !== 'replacement' ? { amountPaise } : {}),
      sellerAtFault,
      note,
    });
  }

  reject(issueId: string, reason: string): Promise<{ ok: true }> {
    return this.fn.call('adminRejectIssue', { issueId, reason });
  }
}
