import { Timestamp } from 'firebase/firestore';
import { isActive, limitPaise, toReturn } from './returns.models';
import { payableLeft, toClaim } from '../claims/claims.models';

describe('returns.models', () => {
  it('reads a return, never needing the customer', () => {
    const r = toReturn('i1_s1', {
      issueId: 'i1',
      orderId: '3f2a9c1b-0000',
      status: 'requested',
      dispatch: { state: 'unassigned' },
      storeName: 'Purulia Dark Store',
      sellerId: 'zyppi',
      lines: [{ index: 0, name: 'Milk', quantity: 2, kind: 'damaged', amountPaise: 9000 }],
      amountPaise: 9000,
      resolution: 'wallet',
      mismatch: { note: 'sealed', photos: ['returns/i1_s1/m.jpg'] },
      settle: { state: 'failed', error: 'PayU down' },
      createdAt: Timestamp.fromMillis(1),
    });
    expect(r.shortOrderId).toBe('3F2A9C1B');
    expect(r.unassigned).toBe(true);
    expect(r.mismatchNote).toBe('sealed');
    expect(r.mismatchPhotos).toEqual(['returns/i1_s1/m.jpg']);
    expect(r.settleError).toBe('PayU down');
    expect(isActive(r)).toBe(true);
    expect(isActive(toReturn('x', { status: 'received' }))).toBe(false);
    expect(toReturn('x', { status: 'weird' }).status).toBe('requested');
  });

  it('reads the limit in whole rupees', () => {
    expect(limitPaise('500')).toBe(50_000);
    expect(limitPaise(' 0 ')).toBe(0);
    expect(limitPaise('49.5')).toBeNull();
    expect(limitPaise('abc')).toBeNull();
  });

  it('claims: automatic returns and what ops can still pay', () => {
    const c = toClaim('i1', {
      status: 'returning',
      autoReturn: true,
      returnIds: ['i1_s1', 7],
      amountPaise: 10000,
      returnPaidPaise: 4000,
      reviewReason: null,
    });
    expect(c.status).toBe('returning');
    expect(c.returnIds).toEqual(['i1_s1']);
    expect(payableLeft(c)).toBe(6000);
    expect(payableLeft({ amountPaise: 100, returnPaidPaise: 500 })).toBe(0);
  });
});
