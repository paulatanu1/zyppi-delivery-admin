import { Injectable, inject } from '@angular/core';
import { collection, limit, orderBy, query } from 'firebase/firestore';
import { Callables } from '../../core/firebase/callable';
import { FIRESTORE } from '../../core/firebase/firebase';
import { Live, liveQuery } from '../../core/firebase/live';
import {
  Campaign,
  CampaignDraft,
  Segment,
  Template,
  campaignPayload,
  segmentPayload,
  toCampaign,
  toTemplate,
} from './notifications.models';

export interface Audience {
  count: number;
  byLang: Record<string, number>;
}

/** Campaigns and templates: live reads, callable writes (audited). */
@Injectable({ providedIn: 'root' })
export class NotificationsApi {
  private readonly db = inject(FIRESTORE);
  private readonly callables = inject(Callables);

  /** Injection context only. The latest 100. */
  watchCampaigns(): Live<Campaign[]> {
    return liveQuery(
      query(collection(this.db, 'campaigns'), orderBy('createdAt', 'desc'), limit(100)),
      (s) => s.docs.map((d) => toCampaign(d.id, d.data())),
    );
  }

  /** Injection context only. */
  watchTemplates(): Live<Template[]> {
    return liveQuery(query(collection(this.db, 'notificationTemplates'), orderBy('name')), (s) =>
      s.docs.map((d) => toTemplate(d.id, d.data())),
    );
  }

  save(d: CampaignDraft): Promise<{ id: string }> {
    return this.callables.call('adminSaveCampaign', campaignPayload(d));
  }

  estimate(segment: Segment): Promise<Audience> {
    return this.callables.call('adminEstimateAudience', { segment: segmentPayload(segment) });
  }

  /** `sendAtMs` null = send now. */
  schedule(
    id: string,
    sendAtMs: number | null,
  ): Promise<{ status: 'sent' | 'scheduled'; sent?: number; failed?: number }> {
    return this.callables.call('adminScheduleCampaign', { id, sendAtMs });
  }

  cancel(id: string): Promise<unknown> {
    return this.callables.call('adminCancelCampaign', { id });
  }

  test(d: CampaignDraft, phone: string): Promise<{ ok: true; lang: string }> {
    return this.callables.call('adminTestCampaign', { ...campaignPayload(d), phone });
  }

  saveTemplate(d: CampaignDraft): Promise<{ id: string }> {
    const p = campaignPayload(d);
    return this.callables.call('adminSaveTemplate', {
      name: p.name,
      copy: p.copy,
      translations: p.translations,
    });
  }

  deleteTemplate(id: string): Promise<unknown> {
    return this.callables.call('adminDeleteTemplate', { id });
  }
}
