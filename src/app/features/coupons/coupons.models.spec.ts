import { Timestamp } from 'firebase/firestore';
import {
  Coupon,
  blankCoupon,
  couponPayload,
  couponProblems,
  couponState,
  describeOffer,
  toCoupon,
  toDraft,
} from './coupons.models';

const now = new Date(2026, 10, 14, 12);
const coupon = (over: Record<string, unknown> = {}): Coupon =>
  toCoupon('SAVE', { description: '₹50 off', discountPaise: 5000, isActive: true, ...over });

describe('toCoupon', () => {
  it('reads a v1 coupon as flat with no limits or usage', () => {
    expect(coupon({ minOrderPaise: 30000, expiresAt: null })).toMatchObject({
      type: 'flat',
      discountPaise: 5000,
      minOrderPaise: 30000,
      usageLimit: null,
      perUserLimit: null,
      usedCount: 0,
      expiresAt: null,
    });
  });

  it('reads dates', () => {
    expect(coupon({ startAt: Timestamp.fromDate(now) }).startAt?.getTime()).toBe(now.getTime());
  });
});

describe('describeOffer', () => {
  it('reads like the app', () => {
    expect(describeOffer(coupon())).toBe('₹50 off');
    expect(describeOffer(coupon({ type: 'percent', percent: 20, maxDiscountPaise: 10000 }))).toBe(
      '20% off, up to ₹100',
    );
    expect(describeOffer(coupon({ type: 'percent', percent: 15 }))).toBe('15% off');
  });
});

describe('couponState', () => {
  const later = Timestamp.fromDate(new Date(now.getTime() + 60_000));
  it('follows the server’s order of checks', () => {
    expect(couponState(coupon(), now)).toBe('live');
    expect(couponState(coupon({ isActive: false }), now)).toBe('off');
    expect(couponState(coupon({ startAt: later }), now)).toBe('scheduled');
    expect(couponState(coupon({ expiresAt: Timestamp.fromDate(now) }), now)).toBe('expired');
    expect(couponState(coupon({ usageLimit: 5, usedCount: 5 }), now)).toBe('used_up');
  });
});

describe('form', () => {
  it('converts rupees to paise and drops fields of the other type', () => {
    const d = {
      ...blankCoupon(),
      code: ' new50 ',
      description: 'Flat off',
      discount: 50,
      minOrder: 299.5,
    };
    expect(couponPayload(d)).toMatchObject({
      code: 'NEW50',
      discountPaise: 5000,
      percent: null,
      maxDiscountPaise: null,
      minOrderPaise: 29950,
      perUserLimit: 1,
    });
    const pct = { ...d, type: 'percent' as const, percent: 20, maxDiscount: 100 };
    expect(couponPayload(pct)).toMatchObject({
      discountPaise: null,
      percent: 20,
      maxDiscountPaise: 10000,
    });
  });

  it('round-trips an existing coupon', () => {
    const c = coupon({ type: 'percent', percent: 10, maxDiscountPaise: 5000, discountPaise: 0 });
    expect(couponPayload(toDraft(c))).toMatchObject({
      isNew: false,
      percent: 10,
      maxDiscountPaise: 5000,
    });
  });

  it('flags what the server would refuse', () => {
    const ok = { ...blankCoupon(), code: 'SAVE50', description: 'Flat ₹50 off', discount: 50 };
    expect(couponProblems(ok)).toEqual([]);
    expect(couponProblems({ ...ok, code: 'a b' })).toHaveLength(1);
    expect(couponProblems({ ...ok, minOrder: 30 })).toEqual([
      'The discount is more than the minimum order.',
    ]);
    expect(couponProblems({ ...ok, type: 'percent', percent: 95 })).toEqual([
      'Enter a whole percent from 1 to 90.',
    ]);
    expect(couponProblems({ ...ok, usageLimit: 0 })).toEqual([
      'Total uses: a whole number, 1 or more.',
    ]);
  });
});
