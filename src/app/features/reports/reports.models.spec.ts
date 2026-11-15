import { fileName, formatCell, pdfDefinition, sheetRows } from './export';
import {
  areaReport,
  categoryReport,
  couponReport,
  customerReport,
  inventoryReport,
  paymentReport,
  productReport,
  rangeLabel,
  riderReport,
  salesReport,
} from './reports.models';
import {
  addDays,
  aov,
  bucketKey,
  bucketLabel,
  cancelRate,
  daysBetween,
  istDay,
  series,
  sumDays,
  toDayStats,
  weekStart,
} from './stats.models';

// Shaped like the onOrderWritten trigger's docs.
const d14 = toDayStats('2026-11-14', {
  date: '2026-11-14',
  placed: 3,
  orders: 2,
  gmvPaise: 50000,
  discountPaise: 1000,
  deliveryFeePaise: 0,
  handlingFeePaise: 1000,
  tipPaise: 500,
  cancelled: 1,
  cancelledPaise: 25000,
  refundedPaise: 0,
  newCustomers: 1,
  repeatOrders: 1,
  byMethod: { cod: { orders: 1, paise: 20000 }, upi: { orders: 1, paise: 30000 } },
  byHour: { '13': 2 },
  products: { p1: { qty: 3, paise: 9000 }, p2: { qty: 1, paise: 41000 } },
  coupons: { SAVE10: { uses: 1, discountPaise: 1000 } },
  riders: { r1: { delivered: 2, onTime: 1, codPaise: 20000 } },
  names: { products: { p1: 'Milk', p2: 'Basmati rice' }, riders: { r1: 'Asha' } },
});
const d16 = toDayStats('2026-11-16', {
  placed: 1,
  orders: 1,
  gmvPaise: 10000,
  newCustomers: 1,
  byMethod: { cod: { orders: 1, paise: 10000 } },
  products: { p1: { qty: 1, paise: 3000 } },
  names: { products: { p1: 'Milk' } },
});

describe('stats models', () => {
  it('reads a stats doc, defaulting missing counters to 0', () => {
    expect(d16.cancelled).toBe(0);
    expect(d16.date).toBe('2026-11-16');
    expect(d14.productNames).toEqual({ p1: 'Milk', p2: 'Basmati rice' });
    expect(toDayStats('x', { byMethod: 'junk', orders: 'NaN' })).toMatchObject({
      orders: 0,
      byMethod: {},
    });
  });

  it('does date maths on India-time day keys', () => {
    expect(istDay(Date.UTC(2026, 10, 14, 20, 0))).toBe('2026-11-15');
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(daysBetween('2026-11-29', '2026-12-01')).toEqual([
      '2026-11-29',
      '2026-11-30',
      '2026-12-01',
    ]);
    expect(weekStart('2026-11-15')).toBe('2026-11-09'); // a Sunday → its Monday
    expect(bucketKey('2026-11-15', 'month')).toBe('2026-11');
    expect(bucketLabel('2026-11', 'month')).toBe('Nov 2026');
    expect(bucketLabel('2026-11-09', 'week')).toBe('Week of 9 Nov');
  });

  it('sums days, maps included', () => {
    const t = sumDays([d14, d16]);
    expect(t.orders).toBe(3);
    expect(t.gmvPaise).toBe(60000);
    expect(t.byMethod['cod']).toEqual({ orders: 2, paise: 30000 });
    expect(t.products['p1']).toEqual({ qty: 4, paise: 12000 });
    expect(aov(t)).toBe(20000);
    expect(cancelRate(t)).toBe(25);
    expect(aov(sumDays([]))).toBe(0);
  });

  it('fills empty periods in a series', () => {
    const s = series([d14, d16], '2026-11-14', '2026-11-16', 'day');
    expect(s.map((x) => [x.date, x.orders])).toEqual([
      ['2026-11-14', 2],
      ['2026-11-15', 0],
      ['2026-11-16', 1],
    ]);
    const weeks = series([d14, d16], '2026-11-14', '2026-11-16', 'week');
    expect(weeks.map((x) => [x.date, x.orders])).toEqual([
      ['2026-11-09', 2],
      ['2026-11-16', 1],
    ]);
  });
});

describe('reports', () => {
  const from = '2026-11-14';
  const to = '2026-11-16';
  const t = sumDays([d14, d16]);

  it('labels ranges', () => {
    expect(rangeLabel(from, from)).toBe('14 Nov 2026');
    expect(rangeLabel(from, to)).toBe('14 Nov 2026 – 16 Nov 2026');
  });

  it('builds the sales report with a totals row', () => {
    const r = salesReport([d14, d16], from, to, 'day');
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]).toMatchObject({ period: '14 Nov', orders: 2, gmv: 50000, aov: 25000 });
    expect(r.total).toMatchObject({ period: 'Total', orders: 3, gmv: 60000, fees: 1000 });
  });

  it('compares areas, biggest first', () => {
    const a1 = toDayStats('a1_2026-11-14', { areaId: 'a1', orders: 1, gmvPaise: 100 });
    const a2 = toDayStats('a2_2026-11-14', { areaId: 'a2', orders: 2, gmvPaise: 900 });
    const r = areaReport([a1, a2], new Map([['a2', 'Purulia']]), from, to);
    expect(r.rows.map((x) => x['area'])).toEqual(['Purulia', 'a1']);
    expect(r.total!['gmv']).toBe(1000);
  });

  it('ranks products and limits to the top N', () => {
    const r = productReport(t, from, to, 1);
    expect(r.title).toBe('Top 1 products');
    expect(r.rows).toEqual([{ product: 'Basmati rice', qty: 1, sales: 41000, share: 77.4 }]);
  });

  it('rolls products up into categories', () => {
    const r = categoryReport(
      t,
      {
        productCategory: new Map([['p1', 'dairy']]),
        categoryNames: new Map([['dairy', 'Dairy']]),
      },
      from,
      to,
    );
    expect(r.rows.map((x) => [x['category'], x['sales']])).toEqual([
      ['Uncategorised', 41000],
      ['Dairy', 12000],
    ]);
  });

  it('reports coupons, payments and riders', () => {
    expect(couponReport(t, from, to).rows[0]).toEqual({
      code: 'SAVE10',
      uses: 1,
      discount: 1000,
      avg: 1000,
      share: 33.3,
    });
    expect(paymentReport(t, from, to).rows.map((x) => x['method'])).toEqual([
      'Cash on delivery',
      'UPI',
    ]);
    expect(riderReport(t, from, to).rows).toEqual([
      { rider: 'Asha', delivered: 2, onTime: 50, cod: 20000 },
    ]);
  });

  it('splits new and repeat customers', () => {
    const r = customerReport([d14, d16], from, to, 'month');
    expect(r.rows).toEqual([{ period: 'Nov 2026', newCustomers: 2, repeat: 1, repeatShare: 33.3 }]);
  });

  it('values stock and flags low and out of stock', () => {
    const r = inventoryReport(
      [
        { product: 'Milk', variant: '1 L', store: 'Main', quantity: 10, pricePaise: 6000 },
        { product: 'Rice', variant: '5 kg', store: 'Main', quantity: 0, pricePaise: 50000 },
        { product: 'Eggs', variant: '6', store: 'Main', quantity: 3, pricePaise: 4200 },
      ],
      5,
      'As of now',
    );
    expect(r.rows.map((x) => [x['product'], x['state']])).toEqual([
      ['Rice', 'Out of stock'],
      ['Eggs', 'Low'],
      ['Milk', ''],
    ]);
    expect(r.total!['value']).toBe(72600);
  });
});

describe('export', () => {
  const r = salesReport([d14], '2026-11-14', '2026-11-14', 'day');

  it('formats cells by column kind', () => {
    expect(formatCell({ key: 'g', label: 'GMV', kind: 'paise' }, 50000)).toBe('₹500');
    expect(formatCell({ key: 'p', label: 'Share', kind: 'pct' }, 12.5)).toBe('12.5%');
    expect(formatCell({ key: 'n', label: 'Orders', kind: 'int' }, 123456)).toBe('1,23,456');
    expect(formatCell({ key: 'n', label: 'Orders', kind: 'int' }, undefined)).toBe('');
  });

  it('writes spreadsheet rows with rupees as numbers and the total last', () => {
    const rows = sheetRows(r);
    expect(rows[0]).toContain('GMV (₹)');
    expect(rows[1][5]).toBe(500);
    expect(rows.at(-1)?.[0]).toBe('Total');
    expect(rows).toHaveLength(3);
  });

  it('names files after the report and range', () => {
    expect(fileName(r, 'xlsx')).toBe('zyppi-sales-by-day-14-nov-2026.xlsx');
  });

  it('lays out a landscape PDF for wide tables', () => {
    const def = pdfDefinition(r, new Date(Date.UTC(2026, 10, 15)));
    expect(def.pageOrientation).toBe('landscape');
    expect(JSON.stringify(def.content)).toContain('₹500');
  });
});
