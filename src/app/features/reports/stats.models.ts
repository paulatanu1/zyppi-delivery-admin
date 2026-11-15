/**
 * Report counters from `stats/daily/days/{yyyy-mm-dd}` and
 * `stats/areas/days/{areaId}_{yyyy-mm-dd}`, written by the `onOrderWritten`
 * trigger in zyppi-APP/functions/src/stats. Days are India time; an order
 * counts on the day it was placed. Money is int paise.
 */

export interface Bucket {
  orders: number;
  paise: number;
}

export interface ProductStat {
  qty: number;
  paise: number;
}

export interface CouponStat {
  uses: number;
  discountPaise: number;
}

export interface RiderStat {
  delivered: number;
  onTime: number;
  codPaise: number;
}

export interface DayStats {
  date: string;
  areaId: string | null;
  /** Every order placed, cancelled ones included. */
  placed: number;
  /** Placed and not cancelled. */
  orders: number;
  gmvPaise: number;
  itemPaise: number;
  discountPaise: number;
  deliveryFeePaise: number;
  handlingFeePaise: number;
  tipPaise: number;
  delivered: number;
  cancelled: number;
  cancelledPaise: number;
  refundedPaise: number;
  /** First orders (customerOrderNo 1). */
  newCustomers: number;
  /** Second and later orders. */
  repeatOrders: number;
  byMethod: Record<string, Bucket>;
  /** "00"–"23" → orders. */
  byHour: Record<string, number>;
  products: Record<string, ProductStat>;
  coupons: Record<string, CouponStat>;
  riders: Record<string, RiderStat>;
  productNames: Record<string, string>;
  riderNames: Record<string, string>;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function mapOf<T>(v: unknown, f: (x: Record<string, unknown>) => T): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, x] of Object.entries(obj(v))) out[k] = f(obj(x));
  return out;
}

function strings(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, x] of Object.entries(obj(v))) if (typeof x === 'string') out[k] = x;
  return out;
}

export function emptyDay(date: string, areaId: string | null = null): DayStats {
  return toDayStats(date, { areaId });
}

export function toDayStats(date: string, d: Record<string, unknown>): DayStats {
  const names = obj(d['names']);
  return {
    date: typeof d['date'] === 'string' ? d['date'] : date,
    areaId: typeof d['areaId'] === 'string' ? d['areaId'] : null,
    placed: num(d['placed']),
    orders: num(d['orders']),
    gmvPaise: num(d['gmvPaise']),
    itemPaise: num(d['itemPaise']),
    discountPaise: num(d['discountPaise']),
    deliveryFeePaise: num(d['deliveryFeePaise']),
    handlingFeePaise: num(d['handlingFeePaise']),
    tipPaise: num(d['tipPaise']),
    delivered: num(d['delivered']),
    cancelled: num(d['cancelled']),
    cancelledPaise: num(d['cancelledPaise']),
    refundedPaise: num(d['refundedPaise']),
    newCustomers: num(d['newCustomers']),
    repeatOrders: num(d['repeatOrders']),
    byMethod: mapOf(d['byMethod'], (x) => ({ orders: num(x['orders']), paise: num(x['paise']) })),
    byHour: Object.fromEntries(Object.entries(obj(d['byHour'])).map(([k, v]) => [k, num(v)])),
    products: mapOf(d['products'], (x) => ({ qty: num(x['qty']), paise: num(x['paise']) })),
    coupons: mapOf(d['coupons'], (x) => ({
      uses: num(x['uses']),
      discountPaise: num(x['discountPaise']),
    })),
    riders: mapOf(d['riders'], (x) => ({
      delivered: num(x['delivered']),
      onTime: num(x['onTime']),
      codPaise: num(x['codPaise']),
    })),
    productNames: strings(names['products']),
    riderNames: strings(names['riders']),
  };
}

// ---------------------------------------------------------------- dates

const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;
const DAY_MS = 86_400_000;

/** yyyy-mm-dd in India time. */
export function istDay(ms: number = Date.now()): string {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Calendar arithmetic on yyyy-mm-dd keys (no time zones involved). */
export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Every day from `from` to `to`, inclusive (at most 400). */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

/** The Monday of the day's ISO week. */
export function weekStart(day: string): string {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(day, -((dow + 6) % 7));
}

export type Grain = 'day' | 'week' | 'month';

export function bucketKey(day: string, grain: Grain): string {
  if (grain === 'month') return day.slice(0, 7);
  if (grain === 'week') return weekStart(day);
  return day;
}

/** "15 Nov", "Week of 10 Nov", "Nov 2026". */
export function bucketLabel(key: string, grain: Grain): string {
  if (grain === 'month') {
    const d = new Date(`${key}-01T00:00:00Z`);
    return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
  const d = new Date(`${key}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  return grain === 'week' ? `Week of ${d}` : d;
}

// ---------------------------------------------------------------- sums

function addMap<T extends object>(a: Record<string, T>, b: Record<string, T>): void {
  for (const [k, v] of Object.entries(b)) {
    const cur = (a[k] ?? {}) as Record<string, number>;
    const next: Record<string, number> = { ...cur };
    for (const [f, n] of Object.entries(v as Record<string, number>)) next[f] = (cur[f] ?? 0) + n;
    a[k] = next as T;
  }
}

/** Adds days together (any mix of dates or areas). */
export function sumDays(days: DayStats[], date = ''): DayStats {
  const t = emptyDay(date);
  for (const d of days) {
    t.placed += d.placed;
    t.orders += d.orders;
    t.gmvPaise += d.gmvPaise;
    t.itemPaise += d.itemPaise;
    t.discountPaise += d.discountPaise;
    t.deliveryFeePaise += d.deliveryFeePaise;
    t.handlingFeePaise += d.handlingFeePaise;
    t.tipPaise += d.tipPaise;
    t.delivered += d.delivered;
    t.cancelled += d.cancelled;
    t.cancelledPaise += d.cancelledPaise;
    t.refundedPaise += d.refundedPaise;
    t.newCustomers += d.newCustomers;
    t.repeatOrders += d.repeatOrders;
    addMap(t.byMethod, d.byMethod);
    addMap(t.products, d.products);
    addMap(t.coupons, d.coupons);
    addMap(t.riders, d.riders);
    for (const [h, n] of Object.entries(d.byHour)) t.byHour[h] = (t.byHour[h] ?? 0) + n;
    Object.assign(t.productNames, d.productNames);
    Object.assign(t.riderNames, d.riderNames);
  }
  return t;
}

/** Average order value in paise (0 with no orders). */
export function aov(d: Pick<DayStats, 'orders' | 'gmvPaise'>): number {
  return d.orders ? Math.round(d.gmvPaise / d.orders) : 0;
}

/** Cancelled share of placed orders, 0–100, one decimal. */
export function cancelRate(d: Pick<DayStats, 'placed' | 'cancelled'>): number {
  return d.placed ? Math.round((d.cancelled / d.placed) * 1000) / 10 : 0;
}

/**
 * One row per day / week / month in the range, empty periods included so
 * charts don't skip them.
 */
export function series(days: DayStats[], from: string, to: string, grain: Grain): DayStats[] {
  const byKey = new Map<string, DayStats[]>();
  for (const day of daysBetween(from, to)) {
    const k = bucketKey(day, grain);
    if (!byKey.has(k)) byKey.set(k, []);
  }
  for (const d of days) byKey.get(bucketKey(d.date, grain))?.push(d);
  return [...byKey].map(([k, ds]) => sumDays(ds, k));
}

export const METHOD_LABELS: Record<string, string> = {
  cod: 'Cash on delivery',
  upi: 'UPI',
  card: 'Card',
  other: 'Other',
};

export const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));
