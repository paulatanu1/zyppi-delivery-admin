/**
 * Settings → Store: service areas, stores and hours, delivery slots,
 * delivery pricing (config/delivery) and app config (config/app). Saved
 * through the audited callables in zyppi-APP functions/src/admin/settings.ts.
 */

export interface AreaDoc {
  id: string;
  name: string;
  centerLat: number | null;
  centerLng: number | null;
  radiusMeters: number | null;
  isActive: boolean;
}

export interface StoreDoc {
  id: string;
  name: string;
  serviceAreaId: string;
  address: string;
  phone: string;
  /** "" = open all day. */
  open: string;
  close: string;
  /** Rider pickup point; null = the area's centre. */
  lat: number | null;
  lng: number | null;
  isActive: boolean;
}

export interface SlotDoc {
  id: string;
  label: string;
  etaMinutes: number;
  isExpress: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface DeliveryPricing {
  feePaise: number;
  freeAbovePaise: number;
  minOrderPaise: number;
}

export type AnnouncementTone = 'info' | 'warning' | 'offer';

export interface AppConfigDoc {
  supportPhone: string;
  whatsappNumber: string;
  supportEmail: string;
  announcement: { enabled: boolean; text: string; tone: AnnouncementTone };
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const int = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : 0);

export function toArea(id: string, d: Record<string, unknown>): AreaDoc {
  return {
    id,
    name: str(d['name']) || id,
    centerLat: numOrNull(d['centerLat']),
    centerLng: numOrNull(d['centerLng']),
    radiusMeters: numOrNull(d['radiusMeters']),
    isActive: d['isActive'] === true,
  };
}

export function toStore(id: string, d: Record<string, unknown>): StoreDoc {
  const h = (d['hours'] ?? {}) as Record<string, unknown>;
  return {
    id,
    name: str(d['name']) || id,
    serviceAreaId: str(d['serviceAreaId']),
    address: str(d['address']),
    phone: str(d['phone']).replace(/^\+91/, ''),
    open: str(h['open']),
    close: str(h['close']),
    lat: numOrNull(d['lat']),
    lng: numOrNull(d['lng']),
    isActive: d['isActive'] === true,
  };
}

export function toSlot(id: string, d: Record<string, unknown>): SlotDoc {
  return {
    id,
    label: str(d['label']) || id,
    etaMinutes: int(d['etaMinutes']),
    isExpress: d['isExpress'] === true,
    isActive: d['isActive'] === true,
    sortOrder: int(d['sortOrder']),
  };
}

export function toPricing(d: Record<string, unknown> | undefined): DeliveryPricing {
  return {
    feePaise: int(d?.['feePaise']),
    freeAbovePaise: int(d?.['freeAbovePaise']),
    minOrderPaise: int(d?.['minOrderPaise']),
  };
}

export function toAppConfig(d: Record<string, unknown> | undefined): AppConfigDoc {
  const a = (d?.['announcement'] ?? {}) as Record<string, unknown>;
  const tone = str(a['tone']);
  const local = (v: unknown) => str(v).replace(/^\+91/, '');
  return {
    supportPhone: local(d?.['supportPhone']),
    whatsappNumber: local(d?.['whatsappNumber']),
    supportEmail: str(d?.['supportEmail']),
    announcement: {
      enabled: a['enabled'] === true,
      text: str(a['text']),
      tone: tone === 'warning' || tone === 'offer' ? tone : 'info',
    },
  };
}

/** Rupees typed in a form → int paise (₹24.99 → 2499). */
export function rupeesToPaise(rupees: number | null | undefined): number {
  return rupees == null || !Number.isFinite(rupees) ? 0 : Math.round(rupees * 100);
}

/** int paise → rupees for a form field (2499 → 24.99). */
export function paiseToRupees(paise: number): number {
  return paise / 100;
}

/** "08:00–22:00", or "All day". */
export function hoursLabel(s: Pick<StoreDoc, 'open' | 'close'>): string {
  return s.open && s.close ? `${s.open}–${s.close}` : 'All day';
}

/**
 * OpenStreetMap embed around a point (no key, no package): a box about
 * twice the radius wide, with a marker at the centre.
 */
export function osmEmbedUrl(lat: number, lng: number, radiusMeters: number): string {
  const dLat = (radiusMeters * 1.3) / 111_320;
  const dLng = dLat / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const f = (n: number) => n.toFixed(5);
  const bbox = [lng - dLng, lat - dLat, lng + dLng, lat + dLat].map(f).join('%2C');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${f(lat)}%2C${f(lng)}`;
}
