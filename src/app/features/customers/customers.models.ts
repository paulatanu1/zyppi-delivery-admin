import { Timestamp } from 'firebase/firestore';

/** users/{uid}: the app's profile plus the order aggregates kept by the server. */
export interface Customer {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  lang: string;
  createdAt: Timestamp | null;
  orderCount: number;
  totalSpentPaise: number;
  lastOrderAt: Timestamp | null;
  serviceAreaId: string | null;
  notifyOffers: boolean;
  hasDevice: boolean;
  blocked: boolean;
  blockedReason: string | null;
  /** Zyppi wallet balance (written only by functions/src/wallet). */
  walletPaise: number;
  /** "Report a problem" claims, all time. */
  claimCount: number;
  dob: string | null;
  gender: string | null;
  preferredPaymentMethod: string | null;
  notifyOrderUpdates: boolean;
  /** Push tokens of the customer's signed-in phones (newest first). */
  pushTokens: string[];
  pushTokenAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

/** A push token shortened for the screen: enough to tell phones apart. */
export function maskToken(token: string): string {
  return token.length <= 16 ? token : `${token.slice(0, 8)}…${token.slice(-6)}`;
}

/** users/{uid}/cart: a product line (Zyppi stock, or a marketplace offer). */
export interface CartLine {
  id: string;
  productId: string;
  variantId: string;
  offerId: string | null;
  quantity: number;
  updatedAt: Timestamp | null;
}

export function toCartLine(id: string, d: Record<string, unknown>): CartLine {
  const offerId = str(d['offerId']);
  return {
    id,
    productId: str(d['productId']) ?? '',
    variantId: str(d['variantId']) ?? (offerId ? '' : id),
    offerId,
    quantity: Math.max(0, Math.round(Number(d['quantity']) || 0)),
    updatedAt: ts(d['updatedAt']),
  };
}

/** users/{uid}/favourites: doc id = product id. */
export interface Favourite {
  productId: string;
  createdAt: Timestamp | null;
}

export function toFavourite(id: string, d: Record<string, unknown>): Favourite {
  return { productId: id, createdAt: ts(d['createdAt']) };
}

/** users/{uid}/notifications: what the app's inbox shows (functions/src/notifications/inbox.ts). */
export interface InboxEntry {
  id: string;
  kind: string;
  title: string;
  body: string;
  read: boolean;
  at: Timestamp | null;
}

export function toInboxEntry(id: string, d: Record<string, unknown>): InboxEntry {
  return {
    id,
    kind: str(d['kind']) ?? '',
    title: str(d['title']) ?? '',
    body: str(d['body']) ?? '',
    read: d['read'] === true,
    at: ts(d['at']),
  };
}

/** users/{uid}/consents: a legal document the customer accepted (acceptLegal). */
export interface Consent {
  id: string;
  /** terms, privacy, refund, … */
  type: string;
  version: number | null;
  acceptedAt: Timestamp | null;
  /** checkbox, signature+otp, signature+reauth */
  method: string | null;
  appVersion: string | null;
  platform: string | null;
}

export function toConsent(id: string, d: Record<string, unknown>): Consent {
  return {
    id,
    type: str(d['type']) ?? id,
    version: Number.isInteger(d['version']) ? (d['version'] as number) : null,
    acceptedAt: ts(d['acceptedAt']),
    method: str(d['method']),
    appVersion: str(d['appVersion']),
    platform: str(d['platform']),
  };
}

/** A star rating the customer gave a seller on one order (orders.sellerRatings). */
export interface SellerRating {
  orderId: string;
  sellerId: string;
  sellerName: string;
  stars: number;
  at: Timestamp | null;
}

/** The ratings stored on one order; seller names come from its items. */
export function ratingsOf(
  orderId: string,
  d: Record<string, unknown>,
  sellerNames: Record<string, string>,
): SellerRating[] {
  const map = d['sellerRatings'];
  if (!map || typeof map !== 'object') return [];
  return Object.entries(map as Record<string, unknown>).flatMap(([sellerId, v]) => {
    const r = (v ?? {}) as { stars?: unknown; at?: unknown };
    const stars = Number(r.stars);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) return [];
    return [
      { orderId, sellerId, sellerName: sellerNames[sellerId] || sellerId, stars, at: ts(r.at) },
    ];
  });
}

/** Coupon codes used across orders, with how often (most used first). */
export function couponsUsed(
  orders: { couponCode: string | null }[],
): { code: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const o of orders)
    if (o.couponCode) counts.set(o.couponCode, (counts.get(o.couponCode) ?? 0) + 1);
  return [...counts].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count);
}

/** Newest first by `pick`; missing times last. */
export function newestFirst<T>(rows: T[], pick: (r: T) => Timestamp | null): T[] {
  return [...rows].sort((a, b) => (pick(b)?.toMillis() ?? 0) - (pick(a)?.toMillis() ?? 0));
}

/** One line of users/{uid}/wallet (signed: + in, − out). */
export interface WalletEntry {
  id: string;
  type: string;
  amountPaise: number;
  reason: string;
  orderId: string | null;
  status: string | null;
  at: Timestamp | null;
}

export const WALLET_TYPE_LABEL: Record<string, string> = {
  spend: 'Paid for an order',
  release: 'Payment not completed: returned',
  cancel: 'Order cancelled: returned',
  claim: 'Claim approved',
  credit: 'Staff credit',
};

export function toWalletEntry(id: string, d: Record<string, unknown>): WalletEntry {
  return {
    id,
    type: str(d['type']) ?? '',
    amountPaise: Math.round(Number(d['amountPaise']) || 0),
    reason: str(d['reason']) ?? '',
    orderId: str(d['orderId']),
    status: str(d['status']),
    at: ts(d['at']),
  };
}

/** adminCreditWallet allows at most this per credit. */
export const MAX_WALLET_CREDIT_PAISE = 500_000;

export interface CustomerAddress {
  id: string;
  label: string;
  line1: string;
  area: string;
  city: string;
  isDefault: boolean;
  lat: number | null;
  lng: number | null;
}

export interface CustomerAuth {
  exists: boolean;
  email?: string | null;
  phone?: string | null;
  providers?: string[];
  anonymous?: boolean;
  disabled?: boolean;
  createdAt?: Date | null;
  lastSignInAt?: Date | null;
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
const ts = (v: unknown) => (v instanceof Timestamp ? v : null);

/** pushTokens (newest last, server-kept) plus the older single fcmToken, newest first, no repeats. */
function pushTokensOf(d: Record<string, unknown>): string[] {
  const list = Array.isArray(d['pushTokens'])
    ? (d['pushTokens'] as unknown[]).filter((t): t is string => typeof t === 'string' && !!t)
    : [];
  const single = str(d['fcmToken']);
  return [...new Set([...(single ? [single] : []), ...list.reverse()])];
}

export function toCustomer(id: string, d: Record<string, unknown>): Customer {
  return {
    id,
    fullName: str(d['fullName']) ?? '',
    phone: str(d['phone']),
    email: str(d['email']),
    lang: str(d['lang']) ?? 'en',
    createdAt: ts(d['createdAt']),
    orderCount: Number(d['orderCount']) || 0,
    totalSpentPaise: Number(d['totalSpentPaise']) || 0,
    lastOrderAt: ts(d['lastOrderAt']),
    serviceAreaId: str(d['serviceAreaId']),
    notifyOffers: d['notifyOffers'] === true,
    hasDevice: pushTokensOf(d).length > 0,
    blocked: d['blocked'] === true,
    blockedReason: str(d['blockedReason']),
    walletPaise: Math.max(0, Math.round(Number(d['walletPaise']) || 0)),
    claimCount: Number((d['claimStats'] as { count?: unknown } | undefined)?.count) || 0,
    dob: str(d['dob']),
    gender: str(d['gender']),
    preferredPaymentMethod: str(d['preferredPaymentMethod']),
    notifyOrderUpdates: d['notifyOrderUpdates'] !== false,
    pushTokens: pushTokensOf(d),
    pushTokenAt: ts(d['pushTokenAt']),
    updatedAt: ts(d['updatedAt']),
  };
}

export function toAddress(id: string, d: Record<string, unknown>): CustomerAddress {
  return {
    id,
    label: str(d['label']) ?? 'Address',
    line1: str(d['line1']) ?? '',
    area: str(d['area']) ?? '',
    city: str(d['city']) ?? '',
    isDefault: d['isDefault'] === true,
    lat: typeof d['lat'] === 'number' ? d['lat'] : null,
    lng: typeof d['lng'] === 'number' ? d['lng'] : null,
  };
}

export type CustomerQuery =
  | { kind: 'none' }
  | { kind: 'phone'; value: string }
  | { kind: 'email'; value: string }
  | { kind: 'order'; value: string }
  | { kind: 'uid'; value: string }
  | { kind: 'name'; value: string };

/**
 * What the search box means: a phone number (any Indian format → +91…),
 * an email, an order number (#3F2A9C1B), a uid, or the start of a name.
 */
export function parseCustomerQuery(raw: string): CustomerQuery {
  const q = raw.trim();
  if (!q) return { kind: 'none' };
  if (q.includes('@')) return { kind: 'email', value: q.toLowerCase() };
  const digits = q.replace(/[\s\-()+]/g, '');
  if (/^\d{10,12}$/.test(digits)) {
    const ten = digits.slice(-10);
    if (/^[6-9]/.test(ten)) return { kind: 'phone', value: `+91${ten}` };
  }
  const order = q.replace(/^#/, '');
  if (/^[0-9a-f]{8}$/i.test(order) && /\d/.test(order)) {
    return { kind: 'order', value: order.toLowerCase() };
  }
  if (/^[A-Za-z0-9]{20,40}$/.test(q) && /\d/.test(q)) return { kind: 'uid', value: q };
  return { kind: 'name', value: titleCase(q) };
}

/** Names are stored as typed; most start each word with a capital. */
export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase())
    .trim();
}

/** Display name, never blank. */
export function customerName(c: Pick<Customer, 'fullName' | 'phone' | 'id'>): string {
  return c.fullName || c.phone || `Guest ${c.id.slice(0, 6)}`;
}

/** Average order value in paise. */
export function averageOrder(c: Pick<Customer, 'orderCount' | 'totalSpentPaise'>): number {
  return c.orderCount ? Math.round(c.totalSpentPaise / c.orderCount) : 0;
}
