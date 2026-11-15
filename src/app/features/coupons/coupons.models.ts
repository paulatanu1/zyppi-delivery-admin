import { Timestamp } from 'firebase/firestore';
import { formatPaise } from '../../shared/pipes/rupees.pipe';

/** `coupons/{CODE}` v2 (zyppi-APP functions/src/coupons/model.ts). Money is int paise. */
export type CouponType = 'flat' | 'percent';

export interface Coupon {
  code: string;
  description: string;
  type: CouponType;
  discountPaise: number;
  percent: number;
  maxDiscountPaise: number | null;
  minOrderPaise: number;
  startAt: Date | null;
  expiresAt: Date | null;
  usageLimit: number | null;
  perUserLimit: number | null;
  firstOrderOnly: boolean;
  serviceAreaIds: string[];
  isActive: boolean;
  usedCount: number;
  totalDiscountPaise: number;
  updatedAt: Date | null;
}

const num = (v: unknown, fallback = 0) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const date = (v: unknown) => (v instanceof Timestamp ? v.toDate() : null);

export function toCoupon(code: string, d: Record<string, unknown>): Coupon {
  return {
    code,
    description: typeof d['description'] === 'string' ? d['description'] : '',
    type: d['type'] === 'percent' ? 'percent' : 'flat',
    discountPaise: num(d['discountPaise']),
    percent: num(d['percent']),
    maxDiscountPaise: numOrNull(d['maxDiscountPaise']),
    minOrderPaise: num(d['minOrderPaise']),
    startAt: date(d['startAt']),
    expiresAt: date(d['expiresAt']),
    usageLimit: numOrNull(d['usageLimit']),
    perUserLimit: numOrNull(d['perUserLimit']),
    firstOrderOnly: d['firstOrderOnly'] === true,
    serviceAreaIds: Array.isArray(d['serviceAreaIds'])
      ? (d['serviceAreaIds'] as unknown[]).filter((s): s is string => typeof s === 'string')
      : [],
    isActive: d['isActive'] === true,
    usedCount: num(d['usedCount']),
    totalDiscountPaise: num(d['totalDiscountPaise']),
    updatedAt: date(d['updatedAt']),
  };
}

/** "₹50 off" / "20% off, up to ₹100". */
export function describeOffer(
  c: Pick<Coupon, 'type' | 'discountPaise' | 'percent' | 'maxDiscountPaise'>,
): string {
  if (c.type === 'flat') return `${formatPaise(c.discountPaise)} off`;
  return c.maxDiscountPaise
    ? `${c.percent}% off, up to ${formatPaise(c.maxDiscountPaise)}`
    : `${c.percent}% off`;
}

export type CouponState = 'live' | 'scheduled' | 'expired' | 'used_up' | 'off';

/** Can a customer use it right now (their own limits aside)? Same order as the server's checks. */
export function couponState(c: Coupon, now: Date): CouponState {
  if (!c.isActive) return 'off';
  if (c.startAt && c.startAt.getTime() > now.getTime()) return 'scheduled';
  if (c.expiresAt && c.expiresAt.getTime() <= now.getTime()) return 'expired';
  if (c.usageLimit != null && c.usedCount >= c.usageLimit) return 'used_up';
  return 'live';
}

export const COUPON_STATES: Record<CouponState, { label: string; color: string }> = {
  live: { label: 'Live', color: 'success' },
  scheduled: { label: 'Scheduled', color: 'processing' },
  expired: { label: 'Expired', color: 'default' },
  used_up: { label: 'Used up', color: 'default' },
  off: { label: 'Off', color: 'warning' },
};

/** The form, with money in rupees as typed. */
export interface CouponDraft {
  isNew: boolean;
  code: string;
  description: string;
  type: CouponType;
  discount: number | null;
  percent: number | null;
  maxDiscount: number | null;
  minOrder: number | null;
  startAt: Date | null;
  expiresAt: Date | null;
  usageLimit: number | null;
  perUserLimit: number | null;
  firstOrderOnly: boolean;
  serviceAreaIds: string[];
  isActive: boolean;
}

export const blankCoupon = (): CouponDraft => ({
  isNew: true,
  code: '',
  description: '',
  type: 'flat',
  discount: null,
  percent: null,
  maxDiscount: null,
  minOrder: null,
  startAt: null,
  expiresAt: null,
  usageLimit: null,
  perUserLimit: 1,
  firstOrderOnly: false,
  serviceAreaIds: [],
  isActive: true,
});

const rupees = (paise: number | null) => (paise == null ? null : paise / 100);
const paise = (r: number | null) => (r == null ? null : Math.round(r * 100));

export function toDraft(c: Coupon): CouponDraft {
  return {
    isNew: false,
    code: c.code,
    description: c.description,
    type: c.type,
    discount: c.type === 'flat' ? rupees(c.discountPaise) : null,
    percent: c.type === 'percent' ? c.percent : null,
    maxDiscount: rupees(c.maxDiscountPaise),
    minOrder: c.minOrderPaise ? rupees(c.minOrderPaise) : null,
    startAt: c.startAt,
    expiresAt: c.expiresAt,
    usageLimit: c.usageLimit,
    perUserLimit: c.perUserLimit,
    firstOrderOnly: c.firstOrderOnly,
    serviceAreaIds: [...c.serviceAreaIds],
    isActive: c.isActive,
  };
}

/** adminSaveCoupon's payload (paise, epoch millis). */
export function couponPayload(d: CouponDraft) {
  return {
    isNew: d.isNew,
    code: d.code.trim().toUpperCase(),
    description: d.description.trim(),
    type: d.type,
    discountPaise: d.type === 'flat' ? paise(d.discount) : null,
    percent: d.type === 'percent' ? d.percent : null,
    maxDiscountPaise: d.type === 'percent' ? paise(d.maxDiscount) : null,
    minOrderPaise: paise(d.minOrder) ?? 0,
    startAtMs: d.startAt?.getTime() ?? null,
    expiresAtMs: d.expiresAt?.getTime() ?? null,
    usageLimit: d.usageLimit,
    perUserLimit: d.perUserLimit,
    firstOrderOnly: d.firstOrderOnly,
    serviceAreaIds: d.serviceAreaIds,
    isActive: d.isActive,
  };
}

/** Same rules as the server, shown before saving. */
export function couponProblems(d: CouponDraft): string[] {
  const out: string[] = [];
  if (!/^[A-Z0-9]{3,20}$/.test(d.code.trim().toUpperCase())) {
    out.push('Code: 3–20 letters or digits, no spaces.');
  }
  const desc = d.description.trim().length;
  if (desc < 3 || desc > 120) out.push('Describe the offer for customers (3–120 characters).');
  if (d.type === 'flat') {
    if (!d.discount || d.discount < 1) out.push('Enter the discount (at least ₹1).');
    else if (d.minOrder && d.discount > d.minOrder)
      out.push('The discount is more than the minimum order.');
  } else if (!d.percent || d.percent < 1 || d.percent > 90 || !Number.isInteger(d.percent)) {
    out.push('Enter a whole percent from 1 to 90.');
  }
  if (d.startAt && d.expiresAt && d.expiresAt.getTime() <= d.startAt.getTime()) {
    out.push('The end must be after the start.');
  }
  for (const [v, label] of [
    [d.usageLimit, 'Total uses'],
    [d.perUserLimit, 'Uses per customer'],
  ] as const) {
    if (v != null && (!Number.isInteger(v) || v < 1))
      out.push(`${label}: a whole number, 1 or more.`);
  }
  return out;
}
