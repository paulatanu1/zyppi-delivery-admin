import { fillDays, share, totals } from './search-insights.models';

describe('search insights models', () => {
  it('adds up searches and the share that found nothing', () => {
    expect(
      totals([
        { day: '2026-11-19', count: 40, zeroCount: 4 },
        { day: '2026-11-20', count: 60, zeroCount: 6 },
      ]),
    ).toEqual({ searches: 100, zero: 10, zeroPct: 10 });
    expect(totals([])).toEqual({ searches: 0, zero: 0, zeroPct: 0 });
  });

  it('fills quiet days with zero, oldest first', () => {
    const days = fillDays([{ day: '2026-11-19', count: 5, zeroCount: 1 }], 3, '2026-11-20');
    expect(days.map((d) => d.day)).toEqual(['2026-11-18', '2026-11-19', '2026-11-20']);
    expect(days.map((d) => d.count)).toEqual([0, 5, 0]);
  });

  it('sizes bars against the biggest row, never invisible', () => {
    expect(share(50, 100)).toBe(50);
    expect(share(1, 1000)).toBe(2);
    expect(share(5, 0)).toBe(0);
  });
});
