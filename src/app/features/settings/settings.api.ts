import { Injectable, inject } from '@angular/core';
import { collection, doc, orderBy, query } from 'firebase/firestore';
import { Callables } from '../../core/firebase/callable';
import { FIRESTORE } from '../../core/firebase/firebase';
import { Live, liveDoc, liveQuery } from '../../core/firebase/live';
import { Features, FeaturesDoc, FeaturesPatch, parseFeatures } from './features.model';

export interface ServiceArea {
  id: string;
  name: string;
  isActive: boolean;
}

@Injectable({ providedIn: 'root' })
export class SettingsApi {
  private readonly db = inject(FIRESTORE);
  private readonly callables = inject(Callables);

  /** Injection context only. */
  watchFeatures(): Live<FeaturesDoc> {
    return liveDoc(doc(this.db, 'config/features'), (s) => parseFeatures(s.data()));
  }

  /** Injection context only. */
  watchServiceAreas(): Live<ServiceArea[]> {
    return liveQuery(query(collection(this.db, 'serviceAreas'), orderBy('name')), (s) =>
      s.docs.map((d) => ({
        id: d.id,
        name: (d.get('name') as string) ?? d.id,
        isActive: d.get('isActive') === true,
      })),
    );
  }

  /** Validated + audited on the server (super_admin only). */
  updateFeatures(patch: FeaturesPatch): Promise<Features> {
    return this.callables.call<{ patch: FeaturesPatch }, Features>('adminUpdateFeatures', {
      patch,
    });
  }
}
