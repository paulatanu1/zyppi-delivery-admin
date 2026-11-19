import { Injectable, inject } from '@angular/core';
import { collection, doc, orderBy, query } from 'firebase/firestore';
import { Callables } from '../../core/firebase/callable';
import { FIRESTORE } from '../../core/firebase/firebase';
import { Live, liveDoc, liveQuery } from '../../core/firebase/live';
import { Features, FeaturesDoc, FeaturesPatch, parseFeatures } from './features.model';
import {
  AppConfigDoc,
  AreaDoc,
  DeliveryPricing,
  SlotDoc,
  StoreDoc,
  toAppConfig,
  toArea,
  toPricing,
  toSlot,
  toStore,
} from './store-settings.models';

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

  /** Injection context only. Areas with their centre and radius. */
  watchAreaDocs(): Live<AreaDoc[]> {
    return liveQuery(query(collection(this.db, 'serviceAreas'), orderBy('name')), (s) =>
      s.docs.map((d) => toArea(d.id, d.data())),
    );
  }

  /** Injection context only. */
  watchStoreDocs(): Live<StoreDoc[]> {
    return liveQuery(query(collection(this.db, 'stores'), orderBy('name')), (s) =>
      s.docs.map((d) => toStore(d.id, d.data())),
    );
  }

  /** Injection context only. */
  watchSlots(): Live<SlotDoc[]> {
    return liveQuery(collection(this.db, 'deliverySlots'), (s) =>
      s.docs
        .map((d) => toSlot(d.id, d.data()))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.etaMinutes - b.etaMinutes),
    );
  }

  /** Injection context only. */
  watchPricing(): Live<DeliveryPricing> {
    return liveDoc(doc(this.db, 'config/delivery'), (s) => toPricing(s.data()));
  }

  /** Injection context only. */
  watchAppConfig(): Live<AppConfigDoc> {
    return liveDoc(doc(this.db, 'config/app'), (s) => toAppConfig(s.data()));
  }

  saveArea(a: AreaDoc) {
    return this.callables.call<unknown, { id: string }>('adminSaveServiceArea', a);
  }

  saveStore(s: StoreDoc) {
    return this.callables.call<unknown, { id: string }>('adminSaveStore', {
      id: s.id || undefined,
      name: s.name,
      serviceAreaId: s.serviceAreaId,
      address: s.address,
      phone: s.phone,
      hours: s.open && s.close ? { open: s.open, close: s.close } : null,
      lat: s.lat,
      lng: s.lng,
      prepMinutes: s.prepMinutes,
      isActive: s.isActive,
    });
  }

  saveSlot(s: SlotDoc) {
    return this.callables.call<unknown, { id: string }>('adminSaveDeliverySlot', {
      ...s,
      id: s.id || undefined,
    });
  }

  savePricing(p: DeliveryPricing) {
    return this.callables.call<unknown, { id: string }>('adminSaveDeliveryConfig', p);
  }

  saveAppConfig(c: AppConfigDoc) {
    return this.callables.call<unknown, { id: string }>('adminSaveAppConfig', c);
  }
}
