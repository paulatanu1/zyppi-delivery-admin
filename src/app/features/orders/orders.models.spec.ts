import { Timestamp } from 'firebase/firestore';
import { ago, navigateUrl, shortOrderId, toOrder } from './orders.models';

describe('orders.models', () => {
  it('formats short ids like the app', () => {
    expect(shortOrderId('3f2a9c1b-0000-4000-8000-000000000000')).toBe('3F2A9C1B');
    expect(shortOrderId('legacy')).toBe('legacy');
  });

  it('reads an order doc with payment and totals', () => {
    const o = toOrder('3f2a9c1b-0000-4000-8000-000000000000', {
      status: 'out_for_delivery',
      paymentMethod: 'UPI',
      payment: { status: 'succeeded', providerReference: 'mih1' },
      items: [{ name: 'Milk', unit: '1 L', quantity: 2, pricePaise: 6400 }],
      totalPaise: 13300,
    });
    expect(o).toMatchObject({
      shortId: '3F2A9C1B',
      status: 'out_for_delivery',
      paymentStatus: 'succeeded',
      providerReference: 'mih1',
      totalPaise: 13300,
      refundedPaise: 0,
    });
    expect(o.items[0]).toMatchObject({ quantity: 2, image: null });
  });

  it('builds a navigate link only with coordinates', () => {
    expect(navigateUrl(null)).toBeNull();
    expect(
      navigateUrl({
        label: '',
        line1: '',
        area: '',
        city: '',
        state: '',
        postalCode: '',
        landmark: null,
        lat: 23.3,
        lng: 86.3,
      }),
    ).toBe('https://www.google.com/maps/dir/?api=1&destination=23.3,86.3');
  });

  it('shows short relative times', () => {
    const now = 10 * 3600_000;
    expect(ago(Timestamp.fromMillis(now - 5 * 60_000), now)).toBe('5 min');
    expect(ago(Timestamp.fromMillis(now - 3 * 3600_000), now)).toBe('3 h');
  });
});
