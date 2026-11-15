import { Injectable, inject } from '@angular/core';
import { collection, doc } from 'firebase/firestore';
import { Callables } from '../../core/firebase/callable';
import { FIRESTORE } from '../../core/firebase/firebase';
import { Live, liveDoc, liveQuery } from '../../core/firebase/live';
import { Campaign, RiderConfig, toCampaign, toRiderConfig } from './rider-settings.models';

@Injectable({ providedIn: 'root' })
export class RiderSettingsApi {
  private readonly db = inject(FIRESTORE);
  private readonly callables = inject(Callables);

  /** Injection context only. */
  watchConfig(): Live<RiderConfig> {
    return liveDoc(doc(this.db, 'config/riders'), (s) => toRiderConfig(s.data()));
  }

  /** Injection context only. */
  watchCampaigns(): Live<Campaign[]> {
    return liveQuery(collection(this.db, 'riderOffers'), (s) =>
      s.docs
        .map((d) => toCampaign(d.id, d.data()))
        .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    );
  }

  /** Validated + clamped on the server; returns what was saved. */
  saveConfig(c: RiderConfig) {
    return this.callables.call<RiderConfig, RiderConfig>('adminSaveRiderConfig', c);
  }

  saveCampaign(c: Omit<Campaign, 'updatedAt'>) {
    return this.callables.call<unknown, { id: string }>('adminSaveRiderOffer', {
      ...c,
      id: c.id || undefined,
    });
  }
}
