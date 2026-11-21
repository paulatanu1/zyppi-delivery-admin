import { Timestamp } from 'firebase/firestore';
import {
  averageOrder,
  couponsUsed,
  customerName,
  maskToken,
  parseCustomerQuery,
  ratingsOf,
  titleCase,
  toCartLine,
  toConsent,
  toCustomer,
} from './customers.models';
import {
  hoursLabel,
  osmEmbedUrl,
  paiseToRupees,
  rupeesToPaise,
  toAppConfig,
  toStore,
} from '../settings/store-settings.models';
import {
  inboxOrder,
  kbIdFrom,
  linesOf,
  toChat,
  toKbEntry,
  waitedFor,
} from '../support/support.models';

describe('parseCustomerQuery', () => {
  it('reads Indian phone numbers in any format', () => {
    for (const q of ['9830012345', '+91 98300 12345', '098300-12345', '919830012345']) {
      expect(parseCustomerQuery(q)).toEqual({ kind: 'phone', value: '+919830012345' });
    }
  });

  it('reads emails, order numbers, uids and names', () => {
    expect(parseCustomerQuery(' Riya@Mail.com ')).toEqual({
      kind: 'email',
      value: 'riya@mail.com',
    });
    expect(parseCustomerQuery('#3F2A9C1B')).toEqual({ kind: 'order', value: '3f2a9c1b' });
    expect(parseCustomerQuery('aB3dE5fG7hJ9kL1mN3pQ5rS7')).toMatchObject({ kind: 'uid' });
    expect(parseCustomerQuery('riya sen')).toEqual({ kind: 'name', value: 'Riya Sen' });
    expect(parseCustomerQuery('   ')).toEqual({ kind: 'none' });
  });

  it('title-cases non-Latin names safely', () => {
    expect(titleCase('অমিত')).toBe('অমিত');
    expect(titleCase('MOHAN lal')).toBe('Mohan Lal');
  });
});

describe('customer helpers', () => {
  const c = toCustomer('uid123456', { orderCount: 4, totalSpentPaise: 100001, fcmToken: 't' });

  it('defaults missing fields', () => {
    expect(c).toMatchObject({
      fullName: '',
      phone: null,
      blocked: false,
      hasDevice: true,
      lang: 'en',
    });
  });

  it('never shows a blank name and averages orders', () => {
    expect(customerName(c)).toBe('Guest uid123');
    expect(customerName({ ...c, phone: '+919830012345' })).toBe('+919830012345');
    expect(averageOrder(c)).toBe(25000);
    expect(averageOrder({ orderCount: 0, totalSpentPaise: 0 })).toBe(0);
  });
});

describe('support models', () => {
  const at = (ms: number) => Timestamp.fromMillis(ms);

  it('puts waiting chats first, longest wait on top', () => {
    const chats = [
      toChat('a', { status: 'agent', updatedAt: at(5) }),
      toChat('b', { status: 'waiting_agent', handoffAt: at(20) }),
      toChat('c', { status: 'waiting_agent', handoffAt: at(10) }),
      toChat('d', { status: 'closed', updatedAt: at(99) }),
    ];
    expect(chats.sort(inboxOrder).map((c) => c.id)).toEqual(['c', 'b', 'a', 'd']);
  });

  it('formats waits and reads unknown statuses as bot', () => {
    expect(waitedFor(at(0), 12 * 60_000)).toBe('12 min');
    expect(waitedFor(at(0), 3 * 3600_000)).toBe('3 h');
    expect(waitedFor(null)).toBe('');
    expect(toChat('x', { status: 'weird' }).status).toBe('bot');
  });

  it('reads KB entries and makes ids from titles', () => {
    const e = toKbEntry('refund', { title: { en: 'Refund' }, questions: { en: ['a', 1] } });
    expect(e.title.bn).toBe('');
    expect(e.questions.en).toEqual(['a']);
    expect(e.action).toBe('none');
    expect(kbIdFrom('Where is my order?')).toBe('where_is_my_order');
    expect(linesOf(' a \n\n b ')).toEqual(['a', 'b']);
  });
});

describe('store settings models', () => {
  it('converts rupees and paise without float drift', () => {
    expect(rupeesToPaise(24.99)).toBe(2499);
    expect(rupeesToPaise(null)).toBe(0);
    expect(paiseToRupees(49900)).toBe(499);
  });

  it('reads stores and app config for the forms', () => {
    const s = toStore('s1', {
      name: 'Main',
      phone: '+919830012345',
      hours: { open: '08:00', close: '22:00' },
    });
    expect(s).toMatchObject({ phone: '9830012345', open: '08:00', isActive: false });
    expect(hoursLabel(s)).toBe('08:00–22:00');
    expect(hoursLabel({ open: '', close: '' })).toBe('All day');
    expect(toAppConfig(undefined).announcement).toEqual({ enabled: false, text: '', tone: 'info' });
  });

  it('builds an OpenStreetMap embed around the centre', () => {
    const url = osmEmbedUrl(23.3324, 86.3617, 6000);
    expect(url).toContain('marker=23.33240%2C86.36170');
    expect(url.startsWith('https://www.openstreetmap.org/export/embed.html?bbox=')).toBe(true);
  });
});

describe('customer details', () => {
  it('lists every push token once, newest first (fcmToken, then pushTokens newest last)', () => {
    const c = toCustomer('u1', { fcmToken: 'tok-c', pushTokens: ['tok-a', 'tok-b', 'tok-c'] });
    expect(c.pushTokens).toEqual(['tok-c', 'tok-b', 'tok-a']);
    expect(c.hasDevice).toBe(true);
    expect(toCustomer('u2', {}).hasDevice).toBe(false);
  });

  it('reads the profile fields the app saves', () => {
    const c = toCustomer('u1', {
      dob: '1990-04-02',
      gender: 'female',
      preferredPaymentMethod: 'UPI',
      notifyOrderUpdates: false,
    });
    expect([c.dob, c.gender, c.preferredPaymentMethod, c.notifyOrderUpdates]).toEqual([
      '1990-04-02',
      'female',
      'UPI',
      false,
    ]);
    expect(toCustomer('u2', {}).notifyOrderUpdates).toBe(true);
  });

  it('masks long tokens but keeps both ends', () => {
    expect(maskToken('abcdefgh1234567890xyzuvw')).toBe('abcdefgh…xyzuvw');
    expect(maskToken('short')).toBe('short');
  });

  it('reads Zyppi and marketplace cart lines', () => {
    expect(toCartLine('v-milk', { productId: 'p1', quantity: 2 })).toMatchObject({
      productId: 'p1',
      variantId: 'v-milk',
      offerId: null,
      quantity: 2,
    });
    expect(
      toCartLine('off1', { productId: 'p1', offerId: 'off1', variantId: 'v1', quantity: 1 }),
    ).toMatchObject({ variantId: 'v1', offerId: 'off1' });
  });

  it('reads consents with app version and platform', () => {
    const at = Timestamp.fromMillis(1);
    expect(
      toConsent('terms_3', {
        type: 'terms',
        version: 3,
        acceptedAt: at,
        method: 'checkbox',
        appVersion: '1.0.0+6',
        platform: 'android',
      }),
    ).toEqual({
      id: 'terms_3',
      type: 'terms',
      version: 3,
      acceptedAt: at,
      method: 'checkbox',
      appVersion: '1.0.0+6',
      platform: 'android',
    });
  });

  it('reads seller ratings from an order, skipping bad ones', () => {
    const r = ratingsOf(
      'o1',
      { sellerRatings: { s1: { stars: 4 }, s2: { stars: 9 }, s3: {} } },
      { s1: 'Fresh Mart' },
    );
    expect(r).toEqual([
      { orderId: 'o1', sellerId: 's1', sellerName: 'Fresh Mart', stars: 4, at: null },
    ]);
    expect(ratingsOf('o2', {}, {})).toEqual([]);
  });

  it('counts coupons used, most used first', () => {
    expect(
      couponsUsed([
        { couponCode: 'A' },
        { couponCode: 'B' },
        { couponCode: 'B' },
        { couponCode: null },
      ]),
    ).toEqual([
      { code: 'B', count: 2 },
      { code: 'A', count: 1 },
    ]);
  });
});
