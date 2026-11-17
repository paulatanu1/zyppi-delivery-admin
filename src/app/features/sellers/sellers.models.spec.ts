import { Timestamp } from 'firebase/firestore';
import {
  photoDistanceM,
  previewPrice,
  reliabilityPercent,
  toListing,
  toPlan,
  toSeller,
} from './sellers.models';

describe('sellers models', () => {
  it('reads a seller doc defensively', () => {
    const s = toSeller('u1', {
      status: 'applied',
      shopName: 'Sima Store',
      model: 'subscription',
      docs: { selfie: { path: 'sellers/u1/kyc/s.jpg', lat: 23.3, lng: 86.3 }, signature: 'oops' },
      rating: { avg: 4.6, count: 12 },
      stats: { orders: 50, cancelled: 1, lateAccepts: 4 },
      subscription: { planId: 'p3', status: 'grace', periodEnd: Timestamp.fromMillis(0) },
      compliance: { fssaiExpired: true },
    });
    expect(s.status).toBe('applied');
    expect(Object.keys(s.docs)).toEqual(['selfie']);
    expect(s.ratingAvg).toBe(4.6);
    expect(s.subscription?.status).toBe('grace');
    expect(s.licenceExpired).toBe(true);
    expect(reliabilityPercent(s)).toBe(90);
    expect(reliabilityPercent({ orders: 0, cancelled: 0, lateAccepts: 0 })).toBeNull();
  });

  it('measures how far a shop photo was taken from the pin', () => {
    const s = { lat: 23.3322, lng: 86.3616 };
    expect(photoDistanceM(s, { path: 'x', lat: 23.3326, lng: 86.3616, takenAt: null })).toBe(44);
    expect(photoDistanceM(s, { path: 'x', lat: null, lng: null, takenAt: null })).toBeNull();
  });

  it('previews the customer price like the server', () => {
    expect(previewPrice(5000, null)).toBe(5000);
    expect(previewPrice(5000, { type: 'fixed', value: 500 })).toBe(5500);
    expect(previewPrice(4999, { type: 'percent', value: 10 })).toBe(5499);
  });

  it('reads listings and plans', () => {
    expect(
      toListing('l', { model: 'supply', zyppiPricePaise: 6000, addon: { type: 'x' } }),
    ).toMatchObject({
      model: 'supply',
      zyppiPricePaise: 6000,
      addon: null,
    });
    expect(toPlan('p', { name: 'Quarterly', months: 3, feePaise: 149900 }).months).toBe(3);
    expect(toPlan('p', { months: 7 }).months).toBe(1);
  });
});
