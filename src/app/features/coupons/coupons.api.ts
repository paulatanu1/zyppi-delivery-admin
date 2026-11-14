import { Injectable, inject } from '@angular/core';
import { collection, query } from 'firebase/firestore';
import { Callables } from '../../core/firebase/callable';
import { FIRESTORE } from '../../core/firebase/firebase';
import { Live, liveQuery } from '../../core/firebase/live';
import { Coupon, CouponDraft, couponPayload, toCoupon } from './coupons.models';

/** Coupons: live reads; writes only through the audited callables. */
@Injectable({ providedIn: 'root' })
export class CouponsApi {
  private readonly db = inject(FIRESTORE);
  private readonly callables = inject(Callables);

  /** Injection context only. A few dozen docs; sorted on the client. */
  watchCoupons(): Live<Coupon[]> {
    return liveQuery(query(collection(this.db, 'coupons')), (s) =>
      s.docs.map((d) => toCoupon(d.id, d.data())).sort((a, b) => a.code.localeCompare(b.code)),
    );
  }

  save(d: CouponDraft): Promise<{ code: string }> {
    return this.callables.call('adminSaveCoupon', couponPayload(d));
  }

  /** Only never-used coupons; the server says so otherwise. */
  delete(code: string): Promise<unknown> {
    return this.callables.call('adminDeleteCoupon', { code });
  }
}
