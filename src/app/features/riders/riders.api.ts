import { Injectable, inject } from '@angular/core';
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { Callables } from '../../core/firebase/callable';
import { FIRESTORE, STORAGE } from '../../core/firebase/firebase';
import { Live, liveQuery } from '../../core/firebase/live';
import { compressImage } from '../../shared/util/image';
import { DocKey, PayoutInput, Rider, toRider } from './riders.models';

export interface RiderEvent {
  id: string;
  type: string;
  note: string | null;
  at: Timestamp | null;
}

export interface CashEntry {
  id: string;
  type: 'collected' | 'settled';
  amountPaise: number;
  balanceAfterPaise: number;
  orderId: string | null;
  note: string | null;
  at: Timestamp | null;
}

export type ReviewAction = 'approve' | 'reject' | 'request_changes' | 'suspend' | 'reinstate';

/** Staff side (Riders module) and rider side (portal) of riders/{uid}. */
@Injectable({ providedIn: 'root' })
export class RidersApi {
  private readonly db = inject(FIRESTORE);
  private readonly storage = inject(STORAGE);
  private readonly callables = inject(Callables);

  // ---- Staff -----------------------------------------------------------------

  /** Injection context only. Everyone except drafts. */
  watchAll(): Live<Rider[]> {
    return liveQuery(query(collection(this.db, 'riders'), limit(500)), (s) =>
      s.docs.map((d) => toRider(d.id, d.data())).filter((r) => r.status !== 'draft'),
    );
  }

  /** Approved riders for the order drawer's picker. */
  async approved(): Promise<Rider[]> {
    const s = await getDocs(
      query(collection(this.db, 'riders'), where('status', '==', 'approved')),
    );
    return s.docs
      .map((d) => toRider(d.id, d.data()))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  listenRider(uid: string, next: (r: Rider | null) => void, fail: (e: Error) => void): () => void {
    return onSnapshot(
      doc(this.db, 'riders', uid),
      (s) => next(s.exists() ? toRider(s.id, s.data()) : null),
      fail,
    );
  }

  listenEvents(uid: string, next: (e: RiderEvent[]) => void): () => void {
    return onSnapshot(
      query(collection(this.db, 'riders', uid, 'events'), orderBy('at', 'desc'), limit(30)),
      (s) =>
        next(
          s.docs.map((d) => ({
            id: d.id,
            type: d.get('type'),
            note: d.get('note') ?? null,
            at: d.get('at') instanceof Timestamp ? d.get('at') : null,
          })),
        ),
      () => next([]),
    );
  }

  listenCash(uid: string, next: (e: CashEntry[]) => void): () => void {
    return onSnapshot(
      query(collection(this.db, 'riders', uid, 'cash'), orderBy('at', 'desc'), limit(50)),
      (s) =>
        next(
          s.docs.map((d) => ({
            id: d.id,
            type: d.get('type'),
            amountPaise: d.get('amountPaise') ?? 0,
            balanceAfterPaise: d.get('balanceAfterPaise') ?? 0,
            orderId: d.get('orderId') ?? null,
            note: d.get('note') ?? null,
            at: d.get('at') instanceof Timestamp ? d.get('at') : null,
          })),
        ),
      () => next([]),
    );
  }

  /** Full payout details (finance and the rider only; null otherwise). */
  async payout(uid: string): Promise<PayoutInput | null> {
    try {
      const s = await getDoc(doc(this.db, 'riders', uid, 'private', 'payout'));
      return s.exists() ? (s.data() as PayoutInput) : null;
    } catch {
      return null;
    }
  }

  /** Signed download URL of a private KYC file (rules: rider + ops). */
  docUrl(path: string): Promise<string> {
    return getDownloadURL(ref(this.storage, path));
  }

  review(uid: string, action: ReviewAction, reason = '', checklist?: Record<string, boolean>) {
    return this.callables.call<unknown, { status: string }>('adminReviewRider', {
      uid,
      action,
      reason,
      checklist,
    });
  }

  settleCash(uid: string, amountPaise: number, note: string) {
    return this.callables.call<unknown, { balancePaise: number }>('adminSettleRiderCash', {
      uid,
      amountPaise,
      note,
    });
  }

  // ---- Rider portal -----------------------------------------------------------

  listenMine(uid: string, next: (r: Rider | null) => void, fail: (e: Error) => void): () => void {
    return this.listenRider(uid, next, fail);
  }

  /** Photos are shrunk to WebP; PDFs go as they are (≤ 5 MB). */
  async uploadKyc(uid: string, key: DocKey, file: File): Promise<string> {
    const isPdf = file.type === 'application/pdf';
    if (isPdf && file.size > 5 * 1024 * 1024) throw new Error('PDF is over 5 MB.');
    const blob = isPdf ? file : await compressImage(file, 1600, 0.85);
    const path = `riders/${uid}/kyc/${key}-${Date.now()}.${isPdf ? 'pdf' : 'webp'}`;
    await uploadBytes(ref(this.storage, path), blob, {
      contentType: isPdf ? 'application/pdf' : 'image/webp',
    });
    return path;
  }

  save(application: Record<string, unknown>, submit: boolean) {
    return this.callables.call<unknown, { status: string }>('riderSaveApplication', {
      ...application,
      submit,
    });
  }

  async activeAreas(): Promise<{ label: string; value: string }[]> {
    const s = await getDocs(
      query(collection(this.db, 'serviceAreas'), where('isActive', '==', true)),
    );
    return s.docs
      .map((d) => ({ label: (d.get('name') as string) ?? d.id, value: d.id }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  /** config/features.phoneOtp (missing = on). */
  async phoneOtpOn(): Promise<boolean> {
    try {
      const s = await getDoc(doc(this.db, 'config', 'features'));
      return s.get('phoneOtp') !== false;
    } catch {
      return true;
    }
  }
}
