import { Timestamp } from 'firebase/firestore';
import {
  blankDraft,
  campaignPayload,
  describeSegment,
  draftProblems,
  openRate,
  segmentPayload,
  toCampaign,
  toDraft,
} from './notifications.models';

const ready = () => {
  const d = blankDraft();
  d.name = 'Mango week';
  d.copy.en = { title: 'Mangoes are in', body: '20% off till Sunday' };
  return d;
};

describe('campaignPayload', () => {
  it('sends only the languages that were written, trimmed', () => {
    const d = ready();
    d.copy.hi = { title: ' आम आ गए ', body: 'रविवार तक 20% छूट' };
    const p = campaignPayload(d);
    expect(Object.keys(p.translations)).toEqual(['hi']);
    expect(p.translations.hi?.title).toBe('आम आ गए');
    expect(p.linkTarget).toBeNull();
  });

  it('turns rupees into paise for "spent at least"', () => {
    expect(
      segmentPayload({ serviceAreaIds: [], langs: [], behaviour: 'min_spent', value: 499.5 }).value,
    ).toBe(49950);
    expect(
      segmentPayload({ serviceAreaIds: [], langs: [], behaviour: 'any', value: 9 }).value,
    ).toBeNull();
  });
});

describe('toCampaign / toDraft', () => {
  it('reads paise back as rupees and round-trips the composer', () => {
    const c = toCampaign('c1', {
      name: 'Big spenders',
      copy: { title: 'Thank you', body: 'A gift for you' },
      translations: { bn: { title: 'ধন্যবাদ', body: 'আপনার জন্য উপহার' } },
      linkType: 'coupon',
      linkTarget: 'THANKS',
      segment: { behaviour: 'min_spent', value: 200000, serviceAreaIds: ['a1'], langs: [] },
      status: 'draft',
      createdAt: Timestamp.fromDate(new Date(2026, 10, 14)),
      stats: { targeted: 0, sent: 0, failed: 0, opened: 0 },
    });
    expect(c.segment.value).toBe(2000);
    const d = toDraft(c);
    expect(d.id).toBe('c1');
    expect(d.copy.bn.title).toBe('ধন্যবাদ');
    expect(d.copy.pa).toEqual({ title: '', body: '' });
    expect(campaignPayload(d).segment.value).toBe(200000);
  });
});

describe('draftProblems', () => {
  it('passes a complete draft and flags the rest', () => {
    expect(draftProblems(ready())).toEqual([]);
    const d = ready();
    d.copy.pa = { title: 'ਸਿਰਫ਼ ਸਿਰਲੇਖ', body: '' };
    d.linkType = 'url';
    d.linkTarget = 'http://x';
    d.segment = { serviceAreaIds: [], langs: [], behaviour: 'inactive_days', value: null };
    expect(draftProblems(d)).toEqual([
      'Punjabi: message 2–240 characters.',
      'The link must start with https://',
      'Enter the number of days.',
    ]);
  });
});

describe('describeSegment / openRate', () => {
  it('reads like a sentence', () => {
    const name = (id: string) => (id === 'a1' ? 'Purulia' : '?');
    expect(
      describeSegment(
        { serviceAreaIds: ['a1'], langs: ['hi'], behaviour: 'inactive_days', value: 30 },
        name,
      ),
    ).toBe('Purulia · Hindi · No order for 30+ days');
    expect(
      describeSegment({ serviceAreaIds: [], langs: [], behaviour: 'min_spent', value: 500 }, name),
    ).toBe('All areas · Spent at least ₹500');
  });

  it('is empty before sending', () => {
    const c = toCampaign('x', { stats: { sent: 0, opened: 0 } });
    expect(openRate(c)).toBeNull();
    expect(openRate({ ...c, stats: { ...c.stats, sent: 40, opened: 9 } })).toBe(23);
  });
});
