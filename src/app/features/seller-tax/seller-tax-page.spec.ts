import { monthKey } from './seller-tax-page';

describe('monthKey', () => {
  it('formats the picked month', () => {
    expect(monthKey(new Date(2026, 0, 15))).toBe('2026-01');
    expect(monthKey(new Date(2026, 10, 1))).toBe('2026-11');
  });
});
