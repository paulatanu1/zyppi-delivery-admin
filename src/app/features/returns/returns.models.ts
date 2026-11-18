import { Timestamp } from 'firebase/firestore';

/**
 * Automatic return pickups (returns/{id}; zyppi-APP functions/src/returns,
 * docs/RETURNS.md). Read-only here; ops act through adminUpdateReturn.
 */
export type ReturnStatus =
  | 'requested'
  | 'offered'
  | 'assigned'
  | 'at_customer'
  | 'picked_up'
  | 'at_store'
  | 'received'
  | 'review'
  | 'failed'
  | 'cancelled';

export const RETURN_META: Record<ReturnStatus, { label: string; color: string }> = {
  requested: { label: 'Finding a rider', color: 'orange' },
  offered: { label: 'Offered to a rider', color: 'orange' },
  assigned: { label: 'Rider going to customer', color: 'blue' },
  at_customer: { label: 'Rider at the door', color: 'blue' },
  picked_up: { label: 'Collected, to the store', color: 'cyan' },
  at_store: { label: 'At the store', color: 'cyan' },
  received: { label: 'Received', color: 'green' },
  review: { label: 'Sent to review', color: 'red' },
  failed: { label: 'Customer not available', color: 'default' },
  cancelled: { label: 'Cancelled', color: 'default' },
};

export const ACTIVE_RETURN_STATUSES: ReturnStatus[] = [
  'requested',
  'offered',
  'assigned',
  'at_customer',
  'picked_up',
  'at_store',
];

export interface ReturnLine {
  index: number;
  name: string;
  quantity: number;
  kind: string;
  amountPaise: number;
}

export interface ReturnDoc {
  id: string;
  issueId: string;
  orderId: string;
  shortOrderId: string;
  status: ReturnStatus;
  storeName: string;
  sellerId: string;
  riderName: string | null;
  riderPhone: string | null;
  lines: ReturnLine[];
  amountPaise: number;
  resolution: string;
  /** No rider took it: ops should assign or cancel. */
  unassigned: boolean;
  tries: number;
  pickupPhotos: string[];
  mismatchNote: string | null;
  mismatchPhotos: string[];
  settleState: string | null;
  settleError: string | null;
  createdAt: Timestamp | null;
}

const int = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0);
const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
const strs = (v: unknown) =>
  (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === 'string');

export function toReturn(id: string, d: Record<string, unknown>): ReturnDoc {
  const status =
    (d['status'] as ReturnStatus) in RETURN_META ? (d['status'] as ReturnStatus) : 'requested';
  const orderId = str(d['orderId']) ?? '';
  const mismatch = (d['mismatch'] ?? {}) as Record<string, unknown>;
  const settle = (d['settle'] ?? {}) as Record<string, unknown>;
  const dispatch = (d['dispatch'] ?? {}) as Record<string, unknown>;
  return {
    id,
    issueId: str(d['issueId']) ?? '',
    orderId,
    shortOrderId: orderId.slice(0, 8).toUpperCase(),
    status,
    storeName: str(d['storeName']) ?? 'Store',
    sellerId: str(d['sellerId']) ?? 'zyppi',
    riderName: str(d['riderName']),
    riderPhone: str(d['riderPhone']),
    lines: ((d['lines'] as Record<string, unknown>[] | undefined) ?? []).map((l) => ({
      index: int(l['index']),
      name: str(l['name']) ?? 'Item',
      quantity: int(l['quantity']),
      kind: str(l['kind']) ?? '',
      amountPaise: int(l['amountPaise']),
    })),
    amountPaise: int(d['amountPaise']),
    resolution: str(d['resolution']) ?? 'wallet',
    unassigned: status === 'requested' && dispatch['state'] === 'unassigned',
    tries: int(d['tries']),
    pickupPhotos: strs(d['pickupPhotos']),
    mismatchNote: str(mismatch['note']),
    mismatchPhotos: strs(mismatch['photos']),
    settleState: str(settle['state']),
    settleError: str(settle['error']),
    createdAt: d['createdAt'] instanceof Timestamp ? d['createdAt'] : null,
  };
}

/** Ops can still cancel or send to review while it isn't finished. */
export const isActive = (r: Pick<ReturnDoc, 'status'>) => ACTIVE_RETURN_STATUSES.includes(r.status);

/** "₹500" → 50000 paise; null when not a whole-rupee amount in range. */
export function limitPaise(input: string): number | null {
  const t = input.trim();
  if (!/^\d{1,6}$/.test(t)) return null;
  const n = Number(t) * 100;
  return n <= 10_000_000 ? n : null;
}
