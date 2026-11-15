import { Timestamp } from 'firebase/firestore';

/**
 * `homeSections` as the app reads it (zyppi-APP functions/src/home/home.ts).
 * Items keep their type-specific `data` with snake_case keys; banner
 * carousels are the only type edited here.
 */
export const BANNER_TYPE = 'banner_carousel';

export const SECTION_LABELS: Record<string, string> = {
  banner_carousel: 'Banner carousel',
  category_tabs: 'Category tabs',
  category_grid: 'Category grid',
  product_carousel: 'Product row',
  category_cluster: 'Category cluster',
  spotlight_cards: 'Spotlight cards',
};

export type LinkType = 'none' | 'category' | 'product' | 'url';

export interface Banner {
  id: string;
  title: string;
  ctaText: string | null;
  linkType: LinkType;
  linkTarget: string | null;
  imageUrl: string | null;
  startAt: Date | null;
  endAt: Date | null;
  /** Empty = every area. */
  serviceAreaIds: string[];
  isActive: boolean;
}

export interface HomeSection {
  id: string;
  type: string;
  title: string | null;
  isActive: boolean;
  displayOrder: number;
  itemCount: number;
  /** Banner carousels only. */
  banners: Banner[];
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const date = (v: unknown): Date | null => (v instanceof Timestamp ? v.toDate() : null);

export function toBanner(raw: Record<string, unknown>): Banner {
  const data = (raw['data'] ?? {}) as Record<string, unknown>;
  const linkType = data['link_type'];
  return {
    id: String(raw['id'] ?? ''),
    title: str(data['title']) ?? '',
    ctaText: str(data['cta_text']),
    linkType:
      linkType === 'category' || linkType === 'product' || linkType === 'url' ? linkType : 'none',
    linkTarget: str(data['link_target']),
    imageUrl: str(data['image_url']),
    startAt: date(raw['startAt']),
    endAt: date(raw['endAt']),
    serviceAreaIds: Array.isArray(raw['serviceAreaIds'])
      ? (raw['serviceAreaIds'] as unknown[]).filter((s): s is string => typeof s === 'string')
      : [],
    isActive: raw['isActive'] !== false,
  };
}

export function toSection(id: string, d: Record<string, unknown>): HomeSection {
  const items = Array.isArray(d['items']) ? (d['items'] as Record<string, unknown>[]) : [];
  const type = String(d['type'] ?? '');
  return {
    id,
    type,
    title: str(d['title']),
    isActive: d['isActive'] === true,
    displayOrder: Number(d['displayOrder']) || 0,
    itemCount: items.length,
    banners: type === BANNER_TYPE ? items.map(toBanner) : [],
  };
}

export type BannerState = 'live' | 'scheduled' | 'ended' | 'off';

/** What the app shows right now (area aside). Mirrors HomeSectionItem.isVisibleAt. */
export function bannerState(
  b: Pick<Banner, 'isActive' | 'startAt' | 'endAt'>,
  now: Date,
): BannerState {
  if (!b.isActive) return 'off';
  if (b.endAt && b.endAt.getTime() <= now.getTime()) return 'ended';
  if (b.startAt && b.startAt.getTime() > now.getTime()) return 'scheduled';
  return 'live';
}

export const STATE_LABELS: Record<BannerState, { label: string; color: string }> = {
  live: { label: 'Live', color: 'success' },
  scheduled: { label: 'Scheduled', color: 'processing' },
  ended: { label: 'Ended', color: 'default' },
  off: { label: 'Off', color: 'warning' },
};

/** Date → the value of an `<input type="datetime-local">` (local time, minutes). */
export function toLocalInput(d: Date | null): string {
  if (!d) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** The reverse; '' (cleared) → null. */
export function fromLocalInput(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The callable payload for one banner (dates as epoch millis). */
export function bannerPayload(b: Banner) {
  return {
    id: b.id || null,
    title: b.title.trim(),
    ctaText: b.ctaText?.trim() || null,
    linkType: b.linkType,
    linkTarget: b.linkType === 'none' ? null : b.linkTarget?.trim() || null,
    imageUrl: b.imageUrl,
    startAtMs: b.startAt?.getTime() ?? null,
    endAtMs: b.endAt?.getTime() ?? null,
    serviceAreaIds: b.serviceAreaIds,
    isActive: b.isActive,
  };
}

/** Same checks as the server, shown inline before saving. */
export function bannerProblems(b: Banner): string[] {
  const out: string[] = [];
  const t = b.title.trim();
  if (t.length < 2 || t.length > 60) out.push('Write a headline (2–60 characters).');
  if ((b.ctaText?.trim().length ?? 0) > 24) out.push('Keep the button text to 24 characters.');
  if (b.linkType !== 'none' && !b.linkTarget?.trim())
    out.push(`Choose the ${b.linkType} it opens.`);
  if (b.linkType === 'url' && b.linkTarget && !/^https:\/\//.test(b.linkTarget.trim())) {
    out.push('The link must start with https://');
  }
  if (b.startAt && b.endAt && b.endAt.getTime() <= b.startAt.getTime()) {
    out.push('The end must be after the start.');
  }
  return out;
}
