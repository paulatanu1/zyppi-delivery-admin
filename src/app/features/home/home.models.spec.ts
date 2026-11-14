import { Timestamp } from 'firebase/firestore';
import {
  Banner,
  bannerPayload,
  bannerProblems,
  bannerState,
  fromLocalInput,
  toLocalInput,
  toSection,
} from './home.models';

const now = new Date(2026, 10, 14, 12, 0);
const banner = (over: Partial<Banner> = {}): Banner => ({
  id: 'b1',
  title: 'Fresh fruits',
  ctaText: 'Shop now',
  linkType: 'category',
  linkTarget: 'c1',
  imageUrl: null,
  startAt: null,
  endAt: null,
  serviceAreaIds: [],
  isActive: true,
  ...over,
});

describe('toSection', () => {
  it('reads banner items, seeded ones without a schedule included', () => {
    const s = toSection('s1', {
      type: 'banner_carousel',
      title: null,
      isActive: true,
      displayOrder: 2,
      items: [
        {
          id: 'a',
          data: { title: 'Seeded', cta_text: 'Go', link_type: 'category', link_target: 'c1' },
        },
        {
          id: 'b',
          data: { title: 'Timed', link_type: null },
          startAt: Timestamp.fromDate(now),
          serviceAreaIds: ['x'],
          isActive: false,
        },
      ],
    });
    expect(s.itemCount).toBe(2);
    expect(s.banners[0]).toMatchObject({
      id: 'a',
      linkType: 'category',
      isActive: true,
      startAt: null,
    });
    expect(s.banners[1]).toMatchObject({
      linkType: 'none',
      serviceAreaIds: ['x'],
      isActive: false,
    });
    expect(s.banners[1].startAt?.getTime()).toBe(now.getTime());
  });

  it('keeps other types read-only (no banners)', () => {
    expect(toSection('s', { type: 'category_grid', items: [{}, {}] }).banners).toEqual([]);
  });
});

describe('bannerState', () => {
  const at = (h: number) => new Date(now.getTime() + h * 3600_000);
  it('matches what the app shows', () => {
    expect(bannerState(banner(), now)).toBe('live');
    expect(bannerState(banner({ startAt: at(1) }), now)).toBe('scheduled');
    expect(bannerState(banner({ endAt: now }), now)).toBe('ended');
    expect(bannerState(banner({ isActive: false, startAt: at(1) }), now)).toBe('off');
  });
});

describe('datetime-local helpers', () => {
  it('round-trips local minutes and treats empty as no date', () => {
    expect(toLocalInput(now)).toBe('2026-11-14T12:00');
    expect(fromLocalInput('2026-11-14T12:00')?.getTime()).toBe(now.getTime());
    expect(fromLocalInput('')).toBeNull();
    expect(toLocalInput(null)).toBe('');
  });
});

describe('bannerPayload / bannerProblems', () => {
  it('sends millis and drops the target of a banner that opens nothing', () => {
    expect(bannerPayload(banner({ linkType: 'none', startAt: now }))).toMatchObject({
      linkTarget: null,
      startAtMs: now.getTime(),
      endAtMs: null,
    });
  });

  it('flags what the server would refuse', () => {
    expect(bannerProblems(banner())).toEqual([]);
    expect(bannerProblems(banner({ title: 'x', linkTarget: null }))).toHaveLength(2);
    expect(bannerProblems(banner({ linkType: 'url', linkTarget: 'http://x' }))).toEqual([
      'The link must start with https://',
    ]);
    expect(bannerProblems(banner({ startAt: now, endAt: now }))).toEqual([
      'The end must be after the start.',
    ]);
  });
});
