import { Injectable, inject } from '@angular/core';
import { collection, doc, getDoc, limit, orderBy, query, where } from 'firebase/firestore';
import { getDownloadURL, ref } from 'firebase/storage';
import { Callables } from '../../core/firebase/callable';
import { FIRESTORE, STORAGE } from '../../core/firebase/firebase';
import { Live, liveQuery } from '../../core/firebase/live';
import { ACTIVE_RETURN_STATUSES, ReturnDoc, toReturn } from './returns.models';

export interface ClaimsConfig {
  autoReturns: boolean;
  autoMaxPaise: number;
  autoMaxClaims30d: number;
}

export const DEFAULT_CLAIMS_CONFIG: ClaimsConfig = {
  autoReturns: true,
  autoMaxPaise: 50_000,
  autoMaxClaims30d: 3,
};

/** Return pickups, their limits and dark-store staff logins. */
@Injectable({ providedIn: 'root' })
export class ReturnsApi {
  private readonly db = inject(FIRESTORE);
  private readonly storage = inject(STORAGE);
  private readonly fn = inject(Callables);

  watchActive(): Live<ReturnDoc[]> {
    return liveQuery(
      query(
        collection(this.db, 'returns'),
        where('status', 'in', ACTIVE_RETURN_STATUSES),
        orderBy('createdAt', 'desc'),
        limit(200),
      ),
      (s) => s.docs.map((d) => toReturn(d.id, d.data())),
    );
  }

  watchRecent(): Live<ReturnDoc[]> {
    return liveQuery(
      query(
        collection(this.db, 'returns'),
        where('status', 'in', ['received', 'review', 'failed', 'cancelled']),
        orderBy('createdAt', 'desc'),
        limit(100),
      ),
      (s) => s.docs.map((d) => toReturn(d.id, d.data())),
    );
  }

  /** Signed URL of a rider's photo (storage.rules: ops, support, finance). */
  photoUrl(path: string): Promise<string> {
    return getDownloadURL(ref(this.storage, path));
  }

  update(returnId: string, action: 'cancel' | 'review', reason: string) {
    return this.fn.call<unknown, { ok: true }>('adminUpdateReturn', { returnId, action, reason });
  }

  async config(): Promise<ClaimsConfig> {
    const d = (await getDoc(doc(this.db, 'config', 'claims'))).data() ?? {};
    return {
      autoReturns:
        typeof d['autoReturns'] === 'boolean'
          ? d['autoReturns']
          : DEFAULT_CLAIMS_CONFIG.autoReturns,
      autoMaxPaise: Number(d['autoMaxPaise'] ?? DEFAULT_CLAIMS_CONFIG.autoMaxPaise),
      autoMaxClaims30d: Number(d['autoMaxClaims30d'] ?? DEFAULT_CLAIMS_CONFIG.autoMaxClaims30d),
    };
  }

  saveConfig(c: ClaimsConfig) {
    return this.fn.call<ClaimsConfig, { ok: true }>('adminSaveClaimsConfig', c);
  }

  /**
   * Dark-store staff: a Zyppi Seller login (email, or a phone for older
   * logins) that receives returns.
   */
  setStaff(login: string, action: 'add' | 'remove') {
    const who = login.includes('@') ? { email: login } : { phone: login };
    return this.fn.call<unknown, { uid: string }>('adminSetZyppiStoreStaff', { ...who, action });
  }
}
