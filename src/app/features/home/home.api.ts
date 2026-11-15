import { Injectable, inject } from '@angular/core';
import { collection, orderBy, query } from 'firebase/firestore';
import { Callables } from '../../core/firebase/callable';
import { FIRESTORE } from '../../core/firebase/firebase';
import { Live, liveQuery } from '../../core/firebase/live';
import { Banner, HomeSection, bannerPayload, toSection } from './home.models';

export interface SectionPatch {
  /** Absent = create a new banner carousel. */
  id?: string;
  title?: string | null;
  isActive?: boolean;
  banners?: Banner[];
}

/** Home sections: live reads, writes only through the audited callables. */
@Injectable({ providedIn: 'root' })
export class HomeApi {
  private readonly db = inject(FIRESTORE);
  private readonly callables = inject(Callables);

  /** Injection context only. */
  watchSections(): Live<HomeSection[]> {
    return liveQuery(query(collection(this.db, 'homeSections'), orderBy('displayOrder')), (s) =>
      s.docs.map((d) => toSection(d.id, d.data())),
    );
  }

  /** Injection context only. Taps per banner, keyed `${sectionId}__${itemId}`. */
  watchClicks(): Live<Map<string, number>> {
    return liveQuery(
      collection(this.db, 'bannerStats'),
      (s) => new Map(s.docs.map((d) => [d.id, Number(d.get('clicks')) || 0])),
    );
  }

  saveSection(p: SectionPatch): Promise<{ id: string }> {
    return this.callables.call('adminSaveHomeSection', {
      ...(p.id ? { id: p.id } : {}),
      ...(p.title !== undefined ? { title: p.title } : {}),
      ...(p.isActive !== undefined ? { isActive: p.isActive } : {}),
      ...(p.banners ? { banners: p.banners.map(bannerPayload) } : {}),
    });
  }

  reorder(ids: string[]): Promise<unknown> {
    return this.callables.call('adminReorderHomeSections', { ids });
  }

  deleteSection(id: string): Promise<unknown> {
    return this.callables.call('adminDeleteHomeSection', { id });
  }
}
