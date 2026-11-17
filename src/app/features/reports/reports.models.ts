import { formatPaise } from '../../shared/pipes/rupees.pipe';
import {
  DayStats,
  Grain,
  METHOD_LABELS,
  aov,
  bucketLabel,
  cancelRate,
  series,
  sumDays,
} from './stats.models';

export type ColumnKind = 'text' | 'int' | 'paise' | 'pct';

export interface Column {
  key: string;
  label: string;
  kind: ColumnKind;
}

export type Row = Record<string, string | number>;

/** A report as plain data: shown in a table and exported as is. */
export interface ReportTable {
  title: string;
  /** e.g. "1 Nov 2026 – 15 Nov 2026". */
  subtitle: string;
  columns: Column[];
  rows: Row[];
  /** Totals row, when adding up makes sense. */
  total?: Row;
}

const col = (key: string, label: string, kind: ColumnKind = 'int'): Column => ({
  key,
  label,
  kind,
});

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);

export function rangeLabel(from: string, to: string): string {
  const f = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  return from === to ? f(from) : `${f(from)} – ${f(to)}`;
}

function salesRow(d: DayStats, period: string): Row {
  return {
    period,
    placed: d.placed,
    orders: d.orders,
    cancelled: d.cancelled,
    cancelRate: cancelRate(d),
    gmv: d.gmvPaise,
    aov: aov(d),
    discount: d.discountPaise,
    fees: d.deliveryFeePaise + d.handlingFeePaise,
    tips: d.tipPaise,
    refunded: d.refundedPaise,
    sellerPayouts: d.payoutPaise,
    zyppiShare: d.marginPaise,
  };
}

export function salesReport(days: DayStats[], from: string, to: string, grain: Grain): ReportTable {
  const rows = series(days, from, to, grain).map((d) => salesRow(d, bucketLabel(d.date, grain)));
  return {
    title: `Sales by ${grain}`,
    subtitle: rangeLabel(from, to),
    columns: [
      col('period', grain === 'day' ? 'Day' : grain === 'week' ? 'Week' : 'Month', 'text'),
      col('placed', 'Placed'),
      col('orders', 'Orders'),
      col('cancelled', 'Cancelled'),
      col('cancelRate', 'Cancel %', 'pct'),
      col('gmv', 'GMV', 'paise'),
      col('aov', 'AOV', 'paise'),
      col('discount', 'Discounts', 'paise'),
      col('fees', 'Fees', 'paise'),
      col('tips', 'Tips', 'paise'),
      col('refunded', 'Refunded', 'paise'),
      col('sellerPayouts', 'Seller payouts', 'paise'),
      col('zyppiShare', 'Zyppi share', 'paise'),
    ],
    rows,
    total: salesRow(sumDays(days), 'Total'),
  };
}

export function areaReport(
  areaDays: DayStats[],
  areaNames: Map<string, string>,
  from: string,
  to: string,
): ReportTable {
  const byArea = new Map<string, DayStats[]>();
  for (const d of areaDays) {
    if (!d.areaId) continue;
    byArea.set(d.areaId, [...(byArea.get(d.areaId) ?? []), d]);
  }
  const rows = [...byArea]
    .map(([id, ds]) => {
      const t = sumDays(ds);
      return {
        area: areaNames.get(id) ?? id,
        orders: t.orders,
        gmv: t.gmvPaise,
        aov: aov(t),
        cancelled: t.cancelled,
        cancelRate: cancelRate(t),
        newCustomers: t.newCustomers,
      } as Row;
    })
    .sort((a, b) => (b['gmv'] as number) - (a['gmv'] as number));
  const t = sumDays(areaDays);
  return {
    title: 'Sales by area',
    subtitle: rangeLabel(from, to),
    columns: [
      col('area', 'Area', 'text'),
      col('orders', 'Orders'),
      col('gmv', 'GMV', 'paise'),
      col('aov', 'AOV', 'paise'),
      col('cancelled', 'Cancelled'),
      col('cancelRate', 'Cancel %', 'pct'),
      col('newCustomers', 'New customers'),
    ],
    rows,
    total: {
      area: 'Total',
      orders: t.orders,
      gmv: t.gmvPaise,
      aov: aov(t),
      cancelled: t.cancelled,
      cancelRate: cancelRate(t),
      newCustomers: t.newCustomers,
    },
  };
}

export function productReport(t: DayStats, from: string, to: string, top?: number): ReportTable {
  const total = Object.values(t.products).reduce((s, p) => s + p.paise, 0);
  const rows = Object.entries(t.products)
    .filter(([, p]) => p.qty > 0 || p.paise > 0)
    .map(([id, p]) => ({
      product: t.productNames[id] ?? id,
      qty: p.qty,
      sales: p.paise,
      share: pct(p.paise, total),
    }))
    .sort((a, b) => b.sales - a.sales)
    .slice(0, top ?? Infinity);
  return {
    title: top ? `Top ${top} products` : 'Product performance',
    subtitle: rangeLabel(from, to),
    columns: [
      col('product', 'Product', 'text'),
      col('qty', 'Units sold'),
      col('sales', 'Sales', 'paise'),
      col('share', 'Share %', 'pct'),
    ],
    rows,
  };
}

export interface CatalogIndex {
  /** productId → categoryId (the product's top-level category). */
  productCategory: Map<string, string>;
  categoryNames: Map<string, string>;
}

export function categoryReport(
  t: DayStats,
  catalog: CatalogIndex,
  from: string,
  to: string,
): ReportTable {
  const byCat = new Map<string, { qty: number; sales: number; products: number }>();
  for (const [id, p] of Object.entries(t.products)) {
    if (p.qty <= 0 && p.paise <= 0) continue;
    const cat = catalog.productCategory.get(id) ?? '';
    const cur = byCat.get(cat) ?? { qty: 0, sales: 0, products: 0 };
    byCat.set(cat, {
      qty: cur.qty + p.qty,
      sales: cur.sales + p.paise,
      products: cur.products + 1,
    });
  }
  const total = [...byCat.values()].reduce((s, c) => s + c.sales, 0);
  const rows = [...byCat]
    .map(([id, c]) => ({
      category: id ? (catalog.categoryNames.get(id) ?? id) : 'Uncategorised',
      products: c.products,
      qty: c.qty,
      sales: c.sales,
      share: pct(c.sales, total),
    }))
    .sort((a, b) => b.sales - a.sales);
  return {
    title: 'Category sales',
    subtitle: rangeLabel(from, to),
    columns: [
      col('category', 'Category', 'text'),
      col('products', 'Products sold'),
      col('qty', 'Units sold'),
      col('sales', 'Sales', 'paise'),
      col('share', 'Share %', 'pct'),
    ],
    rows,
  };
}

export function couponReport(t: DayStats, from: string, to: string): ReportTable {
  const rows = Object.entries(t.coupons)
    .filter(([, c]) => c.uses > 0)
    .map(([code, c]) => ({
      code,
      uses: c.uses,
      discount: c.discountPaise,
      avg: c.uses ? Math.round(c.discountPaise / c.uses) : 0,
      share: pct(c.uses, t.orders),
    }))
    .sort((a, b) => b.uses - a.uses);
  const uses = rows.reduce((s, r) => s + r.uses, 0);
  const discount = rows.reduce((s, r) => s + r.discount, 0);
  return {
    title: 'Coupon usage',
    subtitle: rangeLabel(from, to),
    columns: [
      col('code', 'Code', 'text'),
      col('uses', 'Orders'),
      col('discount', 'Discount given', 'paise'),
      col('avg', 'Avg discount', 'paise'),
      col('share', '% of orders', 'pct'),
    ],
    rows,
    total: {
      code: 'Total',
      uses,
      discount,
      avg: uses ? Math.round(discount / uses) : 0,
      share: pct(uses, t.orders),
    },
  };
}

export function paymentReport(t: DayStats, from: string, to: string): ReportTable {
  const rows = Object.entries(t.byMethod)
    .filter(([, b]) => b.orders > 0)
    .map(([k, b]) => ({
      method: METHOD_LABELS[k] ?? k,
      orders: b.orders,
      amount: b.paise,
      share: pct(b.paise, t.gmvPaise),
    }))
    .sort((a, b) => b.amount - a.amount);
  return {
    title: 'Payment methods',
    subtitle: `${rangeLabel(from, to)} · cancelled orders left out · refunded ${refundNote(t)}`,
    columns: [
      col('method', 'Method', 'text'),
      col('orders', 'Orders'),
      col('amount', 'Amount', 'paise'),
      col('share', 'Share %', 'pct'),
    ],
    rows,
    total: { method: 'Total', orders: t.orders, amount: t.gmvPaise, share: t.gmvPaise ? 100 : 0 },
  };
}

function refundNote(t: DayStats): string {
  return formatPaise(t.refundedPaise);
}

export interface RefundLine {
  createdAt: Date | null;
  orderId: string | null;
  amountPaise: number;
  status: string;
  reason: string;
}

export function refundReport(refunds: RefundLine[], from: string, to: string): ReportTable {
  const rows = refunds.map((r) => ({
    date: r.createdAt
      ? r.createdAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
      : '',
    order: r.orderId ? `#${r.orderId.slice(0, 8).toUpperCase()}` : '',
    amount: r.amountPaise,
    status: r.status,
    reason: r.reason,
  }));
  return {
    title: 'Refunds',
    subtitle: rangeLabel(from, to),
    columns: [
      col('date', 'Date', 'text'),
      col('order', 'Order', 'text'),
      col('amount', 'Amount', 'paise'),
      col('status', 'Status', 'text'),
      col('reason', 'Reason', 'text'),
    ],
    rows,
    total: {
      date: 'Total',
      order: '',
      amount: refunds.reduce((s, r) => s + r.amountPaise, 0),
      status: '',
      reason: '',
    },
  };
}

export function riderReport(t: DayStats, from: string, to: string): ReportTable {
  const rows = Object.entries(t.riders)
    .filter(([, r]) => r.delivered > 0)
    .map(([id, r]) => ({
      rider: t.riderNames[id] ?? id,
      delivered: r.delivered,
      onTime: pct(r.onTime, r.delivered),
      cod: r.codPaise,
    }))
    .sort((a, b) => b.delivered - a.delivered);
  return {
    title: 'Rider performance',
    subtitle: `${rangeLabel(from, to)} · orders placed in the range and delivered`,
    columns: [
      col('rider', 'Rider', 'text'),
      col('delivered', 'Delivered'),
      col('onTime', 'On time %', 'pct'),
      col('cod', 'Cash collected', 'paise'),
    ],
    rows,
  };
}

export function customerReport(
  days: DayStats[],
  from: string,
  to: string,
  grain: Grain,
): ReportTable {
  const row = (d: DayStats, period: string): Row => ({
    period,
    newCustomers: d.newCustomers,
    repeat: d.repeatOrders,
    repeatShare: pct(d.repeatOrders, d.newCustomers + d.repeatOrders),
  });
  return {
    title: 'New vs repeat customers',
    subtitle: `${rangeLabel(from, to)} · orders from before stats began are left out`,
    columns: [
      col('period', grain === 'day' ? 'Day' : grain === 'week' ? 'Week' : 'Month', 'text'),
      col('newCustomers', 'First orders'),
      col('repeat', 'Repeat orders'),
      col('repeatShare', 'Repeat %', 'pct'),
    ],
    rows: series(days, from, to, grain).map((d) => row(d, bucketLabel(d.date, grain))),
    total: row(sumDays(days), 'Total'),
  };
}

export interface StockLine {
  product: string;
  variant: string;
  store: string;
  quantity: number;
  pricePaise: number;
}

export function inventoryReport(lines: StockLine[], lowBelow: number, asOf: string): ReportTable {
  const rows = lines
    .map((l) => ({
      product: l.product,
      variant: l.variant,
      store: l.store,
      qty: l.quantity,
      price: l.pricePaise,
      value: l.quantity * l.pricePaise,
      state: l.quantity <= 0 ? 'Out of stock' : l.quantity < lowBelow ? 'Low' : '',
    }))
    .sort((a, b) => a.qty - b.qty || a.product.localeCompare(b.product));
  return {
    title: 'Inventory valuation',
    subtitle: `${asOf} · value at selling price · low = under ${lowBelow}`,
    columns: [
      col('product', 'Product', 'text'),
      col('variant', 'Variant', 'text'),
      col('store', 'Store', 'text'),
      col('qty', 'In stock'),
      col('price', 'Price', 'paise'),
      col('value', 'Value', 'paise'),
      col('state', 'Status', 'text'),
    ],
    rows,
    total: {
      product: 'Total',
      variant: '',
      store: '',
      qty: rows.reduce((s, r) => s + Math.max(0, r.qty), 0),
      price: '',
      value: rows.reduce((s, r) => s + Math.max(0, r.value), 0),
      state: `${rows.filter((r) => r.state).length} low or out`,
    },
  };
}
