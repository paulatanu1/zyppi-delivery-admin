import { Timestamp } from 'firebase/firestore';

/**
 * "Report a problem" claims (orderIssues/{id}), written only by the
 * reportOrderIssue / adminResolveIssue / adminRejectIssue callables
 * (zyppi-APP functions/src/wallet/claims.ts, docs/WALLET.md).
 */
export type ClaimKind = 'missing' | 'wrong' | 'damaged' | 'expired';
export type ClaimResolution = 'wallet' | 'original' | 'replacement';
export type ClaimStatus = 'open' | 'resolving' | 'approved' | 'rejected';

export interface ClaimLine {
  index: number;
  quantity: number;
  kind: ClaimKind;
  name: string;
  sellerId: string;
  amountPaise: number;
}

export interface Claim {
  id: string;
  orderId: string;
  shortOrderId: string;
  userId: string | null;
  status: ClaimStatus;
  lines: ClaimLine[];
  photos: string[];
  note: string;
  resolutionWanted: ClaimResolution;
  amountPaise: number;
  paymentMethod: string | null;
  createdAt: Timestamp | null;
  deliveredAt: Timestamp | null;
  lastError: string | null;
  rejectReason: string | null;
  resolution: {
    type: ClaimResolution | 'rejected' | null;
    walletPaise: number;
    refundPaise: number;
    replacementOrderId: string | null;
    sellerAtFault: boolean;
    sellerDebitPaise: number;
  };
}

export const KIND_LABEL: Record<ClaimKind, string> = {
  missing: 'Missing',
  wrong: 'Wrong item',
  damaged: 'Damaged',
  expired: 'Expired / bad quality',
};

export const RESOLUTION_LABEL: Record<ClaimResolution, string> = {
  wallet: 'Wallet credit',
  original: 'Back to original payment',
  replacement: 'Free replacement',
};

export const STATUS_META: Record<ClaimStatus, { label: string; color: string }> = {
  open: { label: 'To review', color: 'orange' },
  resolving: { label: 'Resolving', color: 'blue' },
  approved: { label: 'Approved', color: 'green' },
  rejected: { label: 'Rejected', color: 'red' },
};

const ZYPPI_SELLER = 'zyppi';
const KINDS: ClaimKind[] = ['missing', 'wrong', 'damaged', 'expired'];
const RESOLUTIONS: ClaimResolution[] = ['wallet', 'original', 'replacement'];
const STATUSES: ClaimStatus[] = ['open', 'resolving', 'approved', 'rejected'];

const int = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0);
const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
const ts = (v: unknown) => (v instanceof Timestamp ? v : null);

export function toClaim(id: string, d: Record<string, unknown>): Claim {
  const r = (d['resolution'] ?? {}) as Record<string, unknown>;
  const orderId = str(d['orderId']) ?? '';
  const status = STATUSES.includes(d['status'] as ClaimStatus)
    ? (d['status'] as ClaimStatus)
    : 'open';
  const wanted = d['resolutionWanted'] as ClaimResolution;
  return {
    id,
    orderId,
    shortOrderId: orderId.slice(0, 8).toUpperCase(),
    userId: str(d['userId']),
    status,
    lines: ((d['lines'] as Record<string, unknown>[] | undefined) ?? []).map((l) => ({
      index: int(l['index']),
      quantity: int(l['quantity']),
      kind: KINDS.includes(l['kind'] as ClaimKind) ? (l['kind'] as ClaimKind) : 'damaged',
      name: str(l['name']) ?? 'Item',
      sellerId: str(l['sellerId']) ?? ZYPPI_SELLER,
      amountPaise: int(l['amountPaise']),
    })),
    photos: ((d['photos'] as unknown[] | undefined) ?? []).filter(
      (p): p is string => typeof p === 'string',
    ),
    note: str(d['note']) ?? '',
    resolutionWanted: RESOLUTIONS.includes(wanted) ? wanted : 'wallet',
    amountPaise: int(d['amountPaise']),
    paymentMethod: str(d['paymentMethod']),
    createdAt: ts(d['createdAt']),
    deliveredAt: ts(d['deliveredAt']),
    lastError: str(d['lastError']),
    rejectReason: str(d['rejectReason']),
    resolution: {
      type: (str(r['type']) as Claim['resolution']['type']) ?? null,
      walletPaise: int(r['walletPaise']),
      refundPaise: int(r['refundPaise']),
      replacementOrderId: str(r['replacementOrderId']),
      sellerAtFault: r['sellerAtFault'] === true,
      sellerDebitPaise: int(r['sellerDebitPaise']),
    },
  };
}

/** Refund to the original payment is only possible for UPI / card orders. */
export function canRefundOriginal(paymentMethod: string | null): boolean {
  return paymentMethod === 'UPI' || paymentMethod === 'Credit or debit card';
}

/** Resolutions staff can pick for [c]. */
export function resolutionsFor(c: Pick<Claim, 'paymentMethod'>): ClaimResolution[] {
  return RESOLUTIONS.filter((r) => r !== 'original' || canRefundOriginal(c.paymentMethod));
}

/** Any line sold by an outside seller (who can be charged when at fault). */
export function hasMarketplaceLine(c: Pick<Claim, 'lines'>): boolean {
  return c.lines.some((l) => l.sellerId !== ZYPPI_SELLER);
}

/** Wrong / damaged / expired lines are usually the seller's fault; missing ones may be the rider's. */
export function suggestSellerAtFault(c: Pick<Claim, 'lines'>): boolean {
  return hasMarketplaceLine(c) && c.lines.every((l) => l.kind !== 'missing');
}

/**
 * The amount typed in rupees (e.g. "49.50") as paise, or null when it is
 * not a positive amount up to [maxPaise].
 */
export function claimAmountPaise(input: string, maxPaise: number): number | null {
  const t = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const paise = Math.round(Number(t) * 100);
  return paise > 0 && paise <= maxPaise ? paise : null;
}

/** Customers with this many claims in their history are flagged. */
export const REPEAT_CLAIMS = 3;
