/** One search term over the chosen period (functions/src/search/search_stats.ts). */
export interface TermRow {
  term: string;
  count: number;
  zeroCount: number;
}

export interface TrendDay {
  day: string;
  count: number;
  zeroCount: number;
}

/** adminSearchInsights response. */
export interface SearchInsights {
  days: number;
  from: string;
  trend: TrendDay[];
  top: TermRow[];
  zeroResults: TermRow[];
}

export const PERIODS = [7, 14, 30] as const;
export type Period = (typeof PERIODS)[number];

export interface Totals {
  searches: number;
  zero: number;
  /** Share of searches that found nothing, 0–100, one decimal. */
  zeroPct: number;
}

export function totals(trend: TrendDay[]): Totals {
  const searches = trend.reduce((n, d) => n + d.count, 0);
  const zero = trend.reduce((n, d) => n + d.zeroCount, 0);
  return { searches, zero, zeroPct: searches ? Math.round((zero / searches) * 1000) / 10 : 0 };
}

/**
 * Every day of the period, oldest first, with 0 for days nobody searched,
 * so the trend line doesn't skip quiet days. `today` is yyyy-mm-dd.
 */
export function fillDays(trend: TrendDay[], days: number, today: string): TrendDay[] {
  const byDay = new Map(trend.map((d) => [d.day, d]));
  const end = new Date(`${today}T00:00:00Z`);
  const out: TrendDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(end.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    out.push(byDay.get(day) ?? { day, count: 0, zeroCount: 0 });
  }
  return out;
}

/** Bar width for a row, as a percentage of the biggest value. */
export function share(value: number, max: number): number {
  return max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
}
