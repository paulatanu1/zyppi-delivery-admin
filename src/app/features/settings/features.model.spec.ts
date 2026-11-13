import { Timestamp } from 'firebase/firestore';
import { parseFeatures, switchPatch, switchValue } from './features.model';

describe('parseFeatures', () => {
  it('treats a missing doc as everything on', () => {
    const f = parseFeatures(undefined);
    expect(f.placesSearch && f.supportBot && f.phoneOtp).toBe(true);
    expect(f.payments).toEqual({ upi: true, card: true });
    expect(f.maintenance.enabled).toBe(false);
    expect(f.updatedAt).toBeNull();
  });

  it('reads stored values and drops bad ones', () => {
    const at = Timestamp.fromMillis(1);
    const f = parseFeatures({
      supportBot: false,
      payments: { card: false },
      closedAreaIds: ['a', 1],
      minAppVersion: '2.0',
      updatedAt: at,
      updatedBy: 'u1',
    });
    expect(f.supportBot).toBe(false);
    expect(f.payments.card).toBe(false);
    expect(f.closedAreaIds).toEqual(['a']);
    expect(f.minAppVersion).toBeNull();
    expect(f.updatedAt).toBe(at);
    expect(f.updatedBy).toBe('u1');
  });
});

describe('switch helpers', () => {
  it('maps payment switches into the nested payments object', () => {
    const f = parseFeatures({ payments: { upi: false } });
    expect(switchValue(f, 'upi')).toBe(false);
    expect(switchPatch('upi', true)).toEqual({ payments: { upi: true } });
    expect(switchPatch('placesSearch', false)).toEqual({ placesSearch: false });
  });
});
