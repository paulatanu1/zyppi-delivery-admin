import { Timestamp } from 'firebase/firestore';
import { activityOf, ago, toOnlineRider, toQueueOrder } from './dispatch.models';
import {
  defaultRiderConfig,
  examplePay,
  toCampaign,
  toRiderConfig,
} from '../rider-settings/rider-settings.models';
import { payable } from '../rider-payouts/rider-payouts.api';

const now = Date.UTC(2026, 10, 16, 6, 0);
const at = (msAgo: number) => Timestamp.fromMillis(now - msAgo);

describe('dispatch models', () => {
  it('reads what an online rider is doing', () => {
    const r = (presence: Record<string, unknown>) =>
      activityOf(
        toOnlineRider('r1', { fullName: 'Asha', presence: { at: at(10_000), ...presence } }),
        now,
      );
    expect(r({})).toBe('idle');
    expect(r({ activeOrderId: 'o1' })).toBe('delivering');
    expect(r({ offerOrderId: 'o2' })).toBe('offered');
    expect(r({ onBreakUntil: Timestamp.fromMillis(now + 60_000) })).toBe('break');
    expect(r({ at: at(5 * 60_000) })).toBe('stale');
  });

  it('reads the dispatch queue', () => {
    const o = toQueueOrder('3f2a9c1b-0000', {
      status: 'out_for_delivery',
      dispatch: { state: 'issue', tried: ['a', 'b'] },
      cannotDeliver: { reason: 'wrong_address', note: 'No such house' },
      payment: { method: 'Cash on delivery' },
      totalPaise: 45000,
    });
    expect(o).toMatchObject({ shortId: '3F2A9C1B', state: 'issue', tried: 2, cod: true });
    expect(o.cannotDeliver).toEqual({ reason: 'wrong_address', note: 'No such house' });
  });

  it('says how long ago', () => {
    expect(ago(at(20_000), now)).toBe('20 s ago');
    expect(ago(at(5 * 60_000), now)).toBe('5 min ago');
    expect(ago(null, now)).toBe('—');
  });
});

describe('rider settings models', () => {
  it('fills defaults and keeps area overrides', () => {
    const c = toRiderConfig({
      pay: { a1: { basePaise: 3000 } },
      slotTemplates: { a1: [{ start: '08:00', end: '12:00' }] },
    });
    expect(c.pay['default']).toEqual(defaultRiderConfig().pay['default']);
    expect(c.pay['a1'].basePaise).toBe(3000);
    expect(c.slotTemplates['default']).toHaveLength(4);
    expect(c.slotTemplates['a1'][0]).toEqual({
      start: '08:00',
      end: '12:00',
      capacity: 5,
      bonusPaise: 0,
    });
  });

  it('works out example pay like the server', () => {
    const r = { basePaise: 2500, perKmPaise: 600, minPaise: 3000, maxPaise: 8000 };
    expect(examplePay(r, 0)).toBe(3000);
    expect(examplePay(r, 2)).toBe(2500 + 1560);
    expect(examplePay(r, 20)).toBe(8000);
  });

  it('reads campaigns and payable balances', () => {
    expect(toCampaign('c1', { title: 'x', kind: 'weekly_target', active: false })).toMatchObject({
      kind: 'weekly_target',
      active: false,
      serviceAreaIds: [],
    });
    expect(payable(50000, 12000)).toBe(38000);
    expect(payable(5000, 12000)).toBe(0);
  });
});
