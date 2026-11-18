import { Timestamp } from 'firebase/firestore';
import {
  claimAmountPaise,
  hasMarketplaceLine,
  resolutionsFor,
  suggestSellerAtFault,
  toClaim,
} from './claims.models';

describe('toClaim', () => {
  it('reads a claim and tolerates missing fields', () => {
    const at = Timestamp.fromMillis(1_000);
    const c = toClaim('i1', {
      orderId: '3f2a9c1b-aaaa',
      userId: 'u1',
      status: 'approved',
      lines: [
        { index: 0, quantity: 2, kind: 'damaged', name: 'Milk', sellerId: 's1', amountPaise: 9000 },
      ],
      photos: ['users/u1/claims/o/a.jpg', 7],
      resolutionWanted: 'replacement',
      amountPaise: 9000,
      createdAt: at,
      resolution: { type: 'wallet', walletPaise: 9000, sellerAtFault: true },
    });
    expect(c.shortOrderId).toBe('3F2A9C1B');
    expect(c.photos).toEqual(['users/u1/claims/o/a.jpg']);
    expect(c.lines[0]).toEqual({
      index: 0,
      quantity: 2,
      kind: 'damaged',
      name: 'Milk',
      sellerId: 's1',
      amountPaise: 9000,
    });
    expect(c.resolution).toEqual({
      type: 'wallet',
      walletPaise: 9000,
      refundPaise: 0,
      replacementOrderId: null,
      sellerAtFault: true,
      sellerDebitPaise: 0,
    });
    expect(c.createdAt).toBe(at);

    const empty = toClaim('i2', { status: 'weird', lines: [{ kind: 'nope' }] });
    expect(empty.status).toBe('open');
    expect(empty.resolutionWanted).toBe('wallet');
    expect(empty.lines[0]).toMatchObject({ kind: 'damaged', sellerId: 'zyppi', name: 'Item' });
  });
});

describe('claim actions', () => {
  it('offers the original payment only for UPI and card orders', () => {
    expect(resolutionsFor({ paymentMethod: 'UPI' })).toEqual(['wallet', 'original', 'replacement']);
    expect(resolutionsFor({ paymentMethod: 'Credit or debit card' })).toContain('original');
    expect(resolutionsFor({ paymentMethod: 'Cash on delivery' })).toEqual([
      'wallet',
      'replacement',
    ]);
    expect(resolutionsFor({ paymentMethod: 'Wallet' })).toEqual(['wallet', 'replacement']);
  });

  it('suggests charging the seller for wrong, damaged or expired items only', () => {
    const line = (kind: 'missing' | 'damaged', sellerId = 's1') => ({
      index: 0,
      quantity: 1,
      kind,
      name: 'x',
      sellerId,
      amountPaise: 100,
    });
    expect(suggestSellerAtFault({ lines: [line('damaged')] })).toBe(true);
    expect(suggestSellerAtFault({ lines: [line('missing')] })).toBe(false);
    expect(suggestSellerAtFault({ lines: [line('damaged', 'zyppi')] })).toBe(false);
    expect(hasMarketplaceLine({ lines: [line('missing', 'zyppi')] })).toBe(false);
  });

  it('reads an amount in rupees, up to the claim value', () => {
    expect(claimAmountPaise('49.5', 10000)).toBe(4950);
    expect(claimAmountPaise(' 100 ', 10000)).toBe(10000);
    expect(claimAmountPaise('100.01', 10000)).toBeNull();
    expect(claimAmountPaise('0', 10000)).toBeNull();
    expect(claimAmountPaise('-5', 10000)).toBeNull();
    expect(claimAmountPaise('1.234', 10000)).toBeNull();
    expect(claimAmountPaise('abc', 10000)).toBeNull();
  });
});
