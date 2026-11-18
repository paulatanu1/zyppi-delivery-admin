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
    hasDevice: !!str(d['fcmToken']),
    blocked: d['blocked'] === true,
    blockedReason: str(d['blockedReason']),
    walletPaise: Math.max(0, Math.round(Number(d['walletPaise']) || 0)),
    claimCount: Number((d['claimStats'] as { count?: unknown } | undefined)?.count) || 0,
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
