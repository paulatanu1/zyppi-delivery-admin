import { Injectable, inject } from '@angular/core';
import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import { Callables } from '../../core/firebase/callable';
import { FIRESTORE } from '../../core/firebase/firebase';
import { Live, liveQuery } from '../../core/firebase/live';
import {
  OnlineRider,
  QueueOrder,
  SosAlert,
  toOnlineRider,
  toQueueOrder,
  toSos,
} from './dispatch.models';

@Injectable({ providedIn: 'root' })
export class DispatchApi {
  private readonly db = inject(FIRESTORE);
  private readonly callables = inject(Callables);

  /** Injection context only. */
  watchOnlineRiders(): Live<OnlineRider[]> {
    return liveQuery(
      query(collection(this.db, 'riders'), where('presence.online', '==', true), limit(300)),
      (s) => s.docs.map((d) => toOnlineRider(d.id, d.data())),
    );
  }

  /** Injection context only. Orders waiting for (or offered to) a rider, or with a problem. */
  watchQueue(): Live<QueueOrder[]> {
    return liveQuery(
      query(
        collection(this.db, 'orders'),
        where('dispatch.state', 'in', ['unassigned', 'offered', 'issue']),
        limit(200),
      ),
      (s) =>
        s.docs
          .map((d) => toQueueOrder(d.id, d.data()))
          .filter((o) => o.status !== 'delivered' && o.status !== 'cancelled'),
    );
  }

  /** Injection context only. */
  watchSos(): Live<SosAlert[]> {
    return liveQuery(
      query(
        collection(this.db, 'sosAlerts'),
        where('status', '==', 'open'),
        orderBy('at', 'desc'),
        limit(50),
      ),
      (s) => s.docs.map((d) => toSos(d.id, d.data())),
    );
  }

  resolveSos(id: string, note: string) {
    return this.callables.call<unknown, { ok: true }>('adminResolveSos', { id, note });
  }
}
