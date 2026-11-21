import { Timestamp } from 'firebase/firestore';

/** Mirrors zyppi-APP functions/src/marketplace (model.ts, pricing.ts, settlement.ts). */
export type SellerStatus =
  'draft' | 'applied' | 'changes_requested' | 'approved' | 'rejected' | 'suspended';
export type SellerModel = 'subscription' | 'supply';
export type Fulfilment = 'seller_shop' | 'zyppi_store';
export type DocKey =
  | 'selfie'
  | 'shopPhoto1'
  | 'shopPhoto2'
  | 'shopPhoto3'
  | 'fssaiCertificate'
  | 'gstCertificate'
  | 'signature';

export const STATUS_META: Record<SellerStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'default' },
  applied: { label: 'To review', color: 'purple' },
  changes_requested: { label: 'Changes asked', color: 'gold' },
  approved: { label: 'Active', color: 'green' },
  rejected: { label: 'Rejected', color: 'red' },
  suspended: { label: 'Suspended', color: 'volcano' },
};

export const MODEL_LABEL: Record<string, string> = {
  subscription: 'Subscription (own price)',
  supply: 'Supply (Zyppi price)',
  own: 'Zyppi',
};

export const FULFILMENT_LABEL: Record<string, string> = {
  seller_shop: 'From their shop',
  zyppi_store: 'Stock in a Zyppi store',
};

export const DOCS: { key: DocKey; label: string }[] = [
  { key: 'selfie', label: 'Live selfie' },
  { key: 'shopPhoto1', label: 'Shop photo 1' },
  { key: 'shopPhoto2', label: 'Shop photo 2' },
  { key: 'shopPhoto3', label: 'Shop photo 3' },
  { key: 'fssaiCertificate', label: 'FSSAI certificate' },
  { key: 'gstCertificate', label: 'GST certificate' },
  { key: 'signature', label: 'Signature' },
];

export const CHECKLIST: { key: string; label: string }[] = [
  { key: 'selfieLive', label: 'Selfie is a real, live face' },
  { key: 'shopMatches', label: 'Shop photos show the signboard at the pinned place' },
  { key: 'panOk', label: 'PAN and name match' },
  { key: 'fssaiOk', label: 'FSSAI licence is valid (food sellers)' },
  { key: 'bankOk', label: 'Bank / UPI is in the owner’s or shop’s name' },
];

export interface Capture {
  path: string;
  lat: number | null;
  lng: number | null;
  takenAt: string | null;
}

export interface Seller {
  id: string;
  status: SellerStatus;
  shopName: string;
  ownerName: string;
  phone: string;
  email: string;
  pan: string;
  gstin: string;
  fssaiNo: string;
  fssaiExpiry: string;
  /** Food shop that applied without an FSSAI licence (optional at apply). */
  fssaiMissing: boolean;
  /** Store ID for "Log in with Store ID" (e.g. ZS482913). */
  storeCode: string;
  shopCategory: string;
  address: string;
  lat: number | null;
  lng: number | null;
  serviceAreaId: string;
  model: SellerModel | 'own' | '';
  fulfilment: Fulfilment | '';
  planId: string;
  docs: Partial<Record<DocKey, Capture>>;
  payout: {
    method: 'upi' | 'bank';
    upiId: string | null;
    accountLast4: string | null;
    ifsc: string | null;
  } | null;
  reviewNote: string | null;
  isOnline: boolean;
  trustedCatalog: boolean;
  ratingAvg: number;
  ratingCount: number;
  orders: number;
  cancelled: number;
  lateAccepts: number;
  heldPaise: number;
  earningsBalancePaise: number;
  duesPaise: number;
  earnedTotalPaise: number;
  paidOutTotalPaise: number;
  subscription: { planId: string; status: string; periodEnd: Timestamp | null } | null;
  licenceExpired: boolean;
  submittedAt: Timestamp | null;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const ts = (v: unknown) => (v instanceof Timestamp ? v : null);
const obj = (v: unknown) =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

export function toSeller(id: string, d: Record<string, unknown>): Seller {
  const docs: Partial<Record<DocKey, Capture>> = {};
  for (const { key } of DOCS) {
    const c = obj(obj(d['docs'])[key]);
    if (typeof c['path'] === 'string') {
      docs[key] = {
        path: c['path'],
        lat: typeof c['lat'] === 'number' ? c['lat'] : null,
        lng: typeof c['lng'] === 'number' ? c['lng'] : null,
        takenAt: typeof c['takenAt'] === 'string' ? c['takenAt'] : null,
      };
    }
  }
  const p = obj(d['payout']);
  const sub = obj(d['subscription']);
  const rating = obj(d['rating']);
  const stats = obj(d['stats']);
  return {
    id,
    status: (str(d['status']) || 'draft') as SellerStatus,
    shopName: str(d['shopName']),
    ownerName: str(d['ownerName']),
    phone: str(d['phone']),
    email: str(d['email']),
    pan: str(d['pan']),
    gstin: str(d['gstin']),
    fssaiNo: str(d['fssaiNo']),
    fssaiExpiry: str(d['fssaiExpiry']),
    fssaiMissing: d['fssaiMissing'] === true,
    storeCode: str(d['storeCode']),
    shopCategory: str(d['shopCategory']),
    address: str(d['address']),
    lat: typeof d['lat'] === 'number' ? d['lat'] : null,
    lng: typeof d['lng'] === 'number' ? d['lng'] : null,
    serviceAreaId: str(d['serviceAreaId']),
    model: str(d['model']) as Seller['model'],
    fulfilment: str(d['fulfilment']) as Seller['fulfilment'],
    planId: str(d['planId']),
    docs,
    payout:
      p['method'] === 'upi' || p['method'] === 'bank'
        ? {
            method: p['method'],
            upiId: (p['upiId'] as string) ?? null,
            accountLast4: (p['accountLast4'] as string) ?? null,
            ifsc: (p['ifsc'] as string) ?? null,
          }
        : null,
    reviewNote: (d['reviewNote'] as string | null) ?? null,
    isOnline: d['isOnline'] === true,
    trustedCatalog: d['trustedCatalog'] === true,
    ratingAvg: num(rating['avg']),
    ratingCount: num(rating['count']),
    orders: num(stats['orders']),
    cancelled: num(stats['cancelled']),
    lateAccepts: num(stats['lateAccepts']),
    heldPaise: num(d['heldPaise']),
    earningsBalancePaise: num(d['earningsBalancePaise']),
    duesPaise: num(d['duesPaise']),
    earnedTotalPaise: num(d['earnedTotalPaise']),
    paidOutTotalPaise: num(d['paidOutTotalPaise']),
    subscription: sub['planId']
      ? {
          planId: str(sub['planId']),
          status: str(sub['status']) || 'active',
          periodEnd: ts(sub['periodEnd']),
        }
      : null,
    licenceExpired: obj(d['compliance'])['fssaiExpired'] === true,
    submittedAt: ts(d['submittedAt']),
  };
}

/** Late or cancelled share of a seller's orders, 0–100, or null with no orders. */
export function reliabilityPercent(
  s: Pick<Seller, 'orders' | 'cancelled' | 'lateAccepts'>,
): number | null {
  if (!s.orders) return null;
  return Math.max(0, Math.round((1 - (s.cancelled + s.lateAccepts) / s.orders) * 100));
}

/** Metres between the shop pin and a geostamped photo (null when either is missing). */
export function photoDistanceM(
  s: Pick<Seller, 'lat' | 'lng'>,
  c: Capture | undefined,
): number | null {
  if (!c || s.lat == null || s.lng == null || c.lat == null || c.lng == null) return null;
  const R = 6_371_000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(c.lat - s.lat);
  const dLng = rad(c.lng - s.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(s.lat)) * Math.cos(rad(c.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

// ------------------------------------------------------------ listings

export interface Adjustment {
  type: 'fixed' | 'percent';
  value: number;
}

export interface Listing {
  id: string;
  productId: string;
  variantId: string;
  serviceAreaId: string;
  model: SellerModel;
  sellerPricePaise: number;
  zyppiPricePaise: number | null;
  addon: Adjustment | null;
  pricePaise: number;
  payoutPaise: number;
  marginPaise: number;
  mrpPaise: number;
  isActive: boolean;
}

export function toListing(id: string, d: Record<string, unknown>): Listing {
  const a = obj(d['addon']);
  return {
    id,
    productId: str(d['productId']),
    variantId: str(d['variantId']),
    serviceAreaId: str(d['serviceAreaId']),
    model: (str(d['model']) || 'subscription') as SellerModel,
    sellerPricePaise: num(d['sellerPricePaise']),
    zyppiPricePaise: typeof d['zyppiPricePaise'] === 'number' ? d['zyppiPricePaise'] : null,
    addon:
      a['type'] === 'fixed' || a['type'] === 'percent'
        ? { type: a['type'], value: num(a['value']) }
        : null,
    pricePaise: num(d['pricePaise']),
    payoutPaise: num(d['payoutPaise']),
    marginPaise: num(d['marginPaise']),
    mrpPaise: num(d['mrpPaise']),
    isActive: d['isActive'] === true,
  };
}

/**
 * Preview of the customer price with an add-on, as the server computes it
 * (percent rounded half up to the paisa). The server re-checks MRP.
 */
export function previewPrice(sellerPricePaise: number, addon: Adjustment | null): number {
  if (!addon) return sellerPricePaise;
  if (addon.type === 'fixed') return sellerPricePaise + addon.value;
  return (
    sellerPricePaise + Math.floor((sellerPricePaise * Math.round(addon.value * 100) + 5000) / 10000)
  );
}

// ------------------------------------------------------------ plans

export interface Plan {
  id: string;
  name: string;
  months: 1 | 3 | 6;
  feePaise: number;
  maxListings: number;
  isActive: boolean;
}

export function toPlan(id: string, d: Record<string, unknown>): Plan {
  const m = num(d['months']);
  return {
    id,
    name: str(d['name']),
    months: (m === 3 || m === 6 ? m : 1) as Plan['months'],
    feePaise: num(d['feePaise']),
    maxListings: num(d['maxListings']),
    isActive: d['isActive'] !== false,
  };
}
