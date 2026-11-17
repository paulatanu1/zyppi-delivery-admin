import { Injectable, inject } from '@angular/core';
import { collection, doc, getDoc, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { Callables } from '../../core/firebase/callable';
import { FIRESTORE } from '../../core/firebase/firebase';
import { LEGAL_TYPES, LegalDraft, LegalHead, LegalLang, LegalType } from './legal.models';

export interface LegalVersionRow {
  version: number;
  title: string;
  requiresReaccept: boolean;
  publishedBy: string;
  effectiveFromMs: number | null;
}

const ms = (v: unknown) =>
  v && typeof (v as { toMillis?: unknown }).toMillis === 'function'
    ? (v as { toMillis(): number }).toMillis()
    : null;

/** legalDocs/{type} (public read) and adminPublishLegalDoc (super admin). */
@Injectable({ providedIn: 'root' })
export class LegalApi {
  private readonly db = inject(FIRESTORE);
  private readonly callables = inject(Callables);

  async heads(): Promise<LegalHead[]> {
    const snaps = await Promise.all(LEGAL_TYPES.map((t) => getDoc(doc(this.db, 'legalDocs', t))));
    return snaps.map((s, i) => ({
      type: LEGAL_TYPES[i],
      title: (s.get('title') as string | undefined) ?? '',
      currentVersion: (s.get('currentVersion') as number | undefined) ?? null,
      minVersion: (s.get('minVersion') as number | undefined) ?? null,
      updatedAtMs: ms(s.get('updatedAt')),
    }));
  }

  /** The live text, to edit from (blank when never published). */
  async current(type: LegalType, version: number | null): Promise<LegalDraft | null> {
    if (!version) return null;
    const s = await getDoc(doc(this.db, 'legalDocs', type, 'versions', String(version)));
    if (!s.exists()) return null;
    const body = (s.get('body') ?? {}) as Partial<Record<LegalLang, string>>;
    return {
      title: (s.get('title') as string) ?? '',
      body: { en: body.en ?? '', bn: body.bn ?? '', hi: body.hi ?? '', pa: body.pa ?? '' },
      requiresReaccept: false,
    };
  }

  async versions(type: LegalType): Promise<LegalVersionRow[]> {
    const s = await getDocs(
      query(
        collection(this.db, 'legalDocs', type, 'versions'),
        orderBy('version', 'desc'),
        limit(20),
      ),
    );
    return s.docs.map((d) => ({
      version: Number(d.get('version')) || 0,
      title: (d.get('title') as string) ?? '',
      requiresReaccept: d.get('requiresReaccept') === true,
      publishedBy: (d.get('publishedBy') as string) ?? '',
      effectiveFromMs: ms(d.get('effectiveFrom')),
    }));
  }

  publish(type: LegalType, d: LegalDraft) {
    return this.callables.call<unknown, { version: number; unchanged: boolean }>(
      'adminPublishLegalDoc',
      {
        type,
        title: d.title.trim(),
        body: d.body,
        requiresReaccept: d.requiresReaccept,
      },
    );
  }
}
