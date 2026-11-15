import { Timestamp } from 'firebase/firestore';
import { formatPaise } from '../../shared/pipes/rupees.pipe';

/** `campaigns` / `notificationTemplates` (zyppi-APP functions/src/notifications/model.ts). */
export type Lang = 'en' | 'bn' | 'hi' | 'pa';
export type OtherLang = Exclude<Lang, 'en'>;
export type LinkType = 'none' | 'product' | 'category' | 'coupon' | 'url';
export type Behaviour =
  'any' | 'never_ordered' | 'ordered_within_days' | 'inactive_days' | 'min_orders' | 'min_spent';
export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled';

export const LANGS: { value: Lang; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'bn', label: 'বাংলা' },
  { value: 'hi', label: 'हिन्दी' },
  { value: 'pa', label: 'ਪੰਜਾਬੀ' },
];

export const BEHAVIOURS: { value: Behaviour; label: string; unit: string | null }[] = [
  { value: 'any', label: 'Everyone who allows offers', unit: null },
  { value: 'never_ordered', label: 'Never ordered', unit: null },
  { value: 'ordered_within_days', label: 'Ordered in the last N days', unit: 'days' },
  { value: 'inactive_days', label: 'No order for N+ days', unit: 'days' },
  { value: 'min_orders', label: 'At least N orders', unit: 'orders' },
  { value: 'min_spent', label: 'Spent at least ₹X', unit: '₹' },
];

export const STATUS: Record<CampaignStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'default' },
  scheduled: { label: 'Scheduled', color: 'processing' },
  sending: { label: 'Sending', color: 'processing' },
  sent: { label: 'Sent', color: 'success' },
  failed: { label: 'Failed', color: 'error' },
  cancelled: { label: 'Cancelled', color: 'default' },
};

export interface Copy {
  title: string;
  body: string;
}

export interface Segment {
  serviceAreaIds: string[];
  langs: Lang[];
  behaviour: Behaviour;
  /** Days or orders as typed; rupees for min_spent (paise on the wire). */
  value: number | null;
}

export interface Campaign {
  id: string;
  name: string;
  copy: Copy;
  translations: Partial<Record<OtherLang, Copy>>;
  imageUrl: string | null;
  linkType: LinkType;
  linkTarget: string | null;
  segment: Segment;
  status: CampaignStatus;
  sendAt: Date | null;
  sentAt: Date | null;
  createdAt: Date | null;
  createdByEmail: string | null;
  failureReason: string | null;
  stats: { targeted: number; sent: number; failed: number; opened: number };
}

export interface Template {
  id: string;
  name: string;
  copy: Copy;
  translations: Partial<Record<OtherLang, Copy>>;
}

const date = (v: unknown) => (v instanceof Timestamp ? v.toDate() : null);
const s = (v: unknown) => (typeof v === 'string' ? v : '');

function toCopy(v: unknown): Copy {
  const r = (v ?? {}) as Record<string, unknown>;
  return { title: s(r['title']), body: s(r['body']) };
}

function toTranslations(v: unknown): Partial<Record<OtherLang, Copy>> {
  const r = (v ?? {}) as Record<string, unknown>;
  const out: Partial<Record<OtherLang, Copy>> = {};
  for (const l of ['bn', 'hi', 'pa'] as const) if (r[l]) out[l] = toCopy(r[l]);
  return out;
}

export function toSegment(v: unknown): Segment {
  const r = (v ?? {}) as Record<string, unknown>;
  const behaviour = BEHAVIOURS.find((b) => b.value === r['behaviour'])?.value ?? 'any';
  const raw = typeof r['value'] === 'number' ? r['value'] : null;
  return {
    serviceAreaIds: Array.isArray(r['serviceAreaIds']) ? (r['serviceAreaIds'] as string[]) : [],
    langs: Array.isArray(r['langs']) ? (r['langs'] as Lang[]) : [],
    behaviour,
    value: raw == null ? null : behaviour === 'min_spent' ? raw / 100 : raw,
  };
}

export function toCampaign(id: string, d: Record<string, unknown>): Campaign {
  const st = (d['stats'] ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => Number(v) || 0;
  return {
    id,
    name: s(d['name']),
    copy: toCopy(d['copy']),
    translations: toTranslations(d['translations']),
    imageUrl: s(d['imageUrl']) || null,
    linkType: (d['linkType'] as LinkType) ?? 'none',
    linkTarget: s(d['linkTarget']) || null,
    segment: toSegment(d['segment']),
    status: (d['status'] as CampaignStatus) ?? 'draft',
    sendAt: date(d['sendAt']),
    sentAt: date(d['sentAt']),
    createdAt: date(d['createdAt']),
    createdByEmail: s(d['createdByEmail']) || null,
    failureReason: s(d['failureReason']) || null,
    stats: {
      targeted: n(st['targeted']),
      sent: n(st['sent']),
      failed: n(st['failed']),
      opened: n(st['opened']),
    },
  };
}

export function toTemplate(id: string, d: Record<string, unknown>): Template {
  return {
    id,
    name: s(d['name']),
    copy: toCopy(d['copy']),
    translations: toTranslations(d['translations']),
  };
}

/** What the composer edits. */
export interface CampaignDraft {
  id: string | null;
  name: string;
  copy: Record<Lang, Copy>;
  imageUrl: string | null;
  linkType: LinkType;
  linkTarget: string | null;
  segment: Segment;
}

const empty = (): Copy => ({ title: '', body: '' });

export const blankDraft = (): CampaignDraft => ({
  id: null,
  name: '',
  copy: { en: empty(), bn: empty(), hi: empty(), pa: empty() },
  imageUrl: null,
  linkType: 'none',
  linkTarget: null,
  segment: { serviceAreaIds: [], langs: [], behaviour: 'any', value: null },
});

export function toDraft(c: Campaign | Template, copyOnly = false): CampaignDraft {
  const base = blankDraft();
  const draft: CampaignDraft = {
    ...base,
    name: c.name,
    copy: {
      en: { ...c.copy },
      bn: { ...(c.translations.bn ?? empty()) },
      hi: { ...(c.translations.hi ?? empty()) },
      pa: { ...(c.translations.pa ?? empty()) },
    },
  };
  if (copyOnly || !('status' in c)) return draft;
  return {
    ...draft,
    id: c.id,
    imageUrl: c.imageUrl,
    linkType: c.linkType,
    linkTarget: c.linkTarget,
    segment: {
      ...c.segment,
      serviceAreaIds: [...c.segment.serviceAreaIds],
      langs: [...c.segment.langs],
    },
  };
}

const filled = (c: Copy) => c.title.trim() !== '' || c.body.trim() !== '';

export function segmentPayload(seg: Segment) {
  const unit = BEHAVIOURS.find((b) => b.value === seg.behaviour)?.unit ?? null;
  return {
    serviceAreaIds: seg.serviceAreaIds,
    langs: seg.langs,
    behaviour: seg.behaviour,
    value:
      unit == null || seg.value == null
        ? null
        : unit === '₹'
          ? Math.round(seg.value * 100)
          : seg.value,
  };
}

/** The adminSaveCampaign payload. */
export function campaignPayload(d: CampaignDraft) {
  const translations: Partial<Record<OtherLang, Copy>> = {};
  for (const l of ['bn', 'hi', 'pa'] as const) {
    if (filled(d.copy[l]))
      translations[l] = { title: d.copy[l].title.trim(), body: d.copy[l].body.trim() };
  }
  return {
    ...(d.id ? { id: d.id } : {}),
    name: d.name.trim(),
    copy: { title: d.copy.en.title.trim(), body: d.copy.en.body.trim() },
    translations,
    imageUrl: d.imageUrl,
    linkType: d.linkType,
    linkTarget: d.linkType === 'none' ? null : d.linkTarget?.trim() || null,
    segment: segmentPayload(d.segment),
  };
}

const LANG_NAME: Record<Lang, string> = {
  en: 'English',
  bn: 'Bengali',
  hi: 'Hindi',
  pa: 'Punjabi',
};

/** Same rules as the server. */
export function draftProblems(d: CampaignDraft): string[] {
  const out: string[] = [];
  const name = d.name.trim().length;
  if (name < 2 || name > 80) out.push('Name the campaign (2–80 characters).');
  for (const l of ['en', 'bn', 'hi', 'pa'] as const) {
    const c = d.copy[l];
    if (l !== 'en' && !filled(c)) continue;
    const t = c.title.trim().length;
    const b = c.body.trim().length;
    if (t < 2 || t > 65) out.push(`${LANG_NAME[l]}: title 2–65 characters.`);
    if (b < 2 || b > 240) out.push(`${LANG_NAME[l]}: message 2–240 characters.`);
  }
  if (d.linkType !== 'none' && !d.linkTarget?.trim())
    out.push(`Choose the ${d.linkType} it opens.`);
  if (d.linkType === 'url' && d.linkTarget && !/^https:\/\//.test(d.linkTarget.trim())) {
    out.push('The link must start with https://');
  }
  const unit = BEHAVIOURS.find((b) => b.value === d.segment.behaviour)?.unit;
  if (unit) {
    const v = d.segment.value;
    const ok = v != null && v > 0 && (unit === '₹' || Number.isInteger(v));
    if (!ok) out.push(unit === '₹' ? 'Enter the amount spent.' : `Enter the number of ${unit}.`);
  }
  return out;
}

/** "Purulia · Hindi, Bengali · No order for 30+ days". */
export function describeSegment(seg: Segment, areaName: (id: string) => string): string {
  const parts: string[] = [];
  parts.push(seg.serviceAreaIds.length ? seg.serviceAreaIds.map(areaName).join(', ') : 'All areas');
  if (seg.langs.length) parts.push(seg.langs.map((l) => LANG_NAME[l]).join(', '));
  const b = BEHAVIOURS.find((x) => x.value === seg.behaviour)!;
  if (b.value !== 'any') {
    const v =
      b.unit === '₹' ? formatPaise(Math.round((seg.value ?? 0) * 100)) : String(seg.value ?? 'N');
    parts.push(b.label.replace('₹X', v).replace(/\bN\b/, v));
  }
  return parts.join(' · ');
}

/** Opened ÷ sent, as a whole percent (null before sending). */
export function openRate(c: Campaign): number | null {
  return c.stats.sent > 0 ? Math.round((c.stats.opened / c.stats.sent) * 100) : null;
}
