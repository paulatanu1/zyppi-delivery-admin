import { Injectable, inject } from '@angular/core';
import {
  Timestamp,
  collection,
  doc,
  documentId,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { FIRESTORE } from '../../core/firebase/firebase';
import { Live, liveDoc, liveQuery } from '../../core/firebase/live';
import { Order, toOrder } from '../orders/orders.models';
import { CatalogIndex, RefundLine, StockLine } from './reports.models';
import { DayStats, emptyDay, toDayStats } from './stats.models';

const DAILY = 'stats/daily/days';
const AREAS = 'stats/areas/days';
const OPEN = ['placed', 'packed', 'out_for_delivery'];

/** Read-only: the counters are written by the onOrderWritten trigger. */
@Injectable({ providedIn: 'root' })
export class StatsApi {
  private readonly db = inject(FIRESTORE);

  /** Injection context only. One day's counters, live (empty if no orders yet). */
  watchDay(day: string): Live<DayStats> {
    return liveDoc(doc(this.db, DAILY, day), (s) =>
      s.exists() ? toDayStats(day, s.data()) : emptyDay(day),
    );
  }

  /** Injection context only. Days `from`…`to` (yyyy-mm-dd), live. */
  watchDays(from: string, to: string): Live<DayStats[]> {
    return liveQuery(this.daysQuery(from, to), (s) =>
      s.docs.map((d) => toDayStats(d.id, d.data())),
    );
  }

  async days(from: string, to: string): Promise<DayStats[]> {
    const s = await getDocs(this.daysQuery(from, to));
    return s.docs.map((d) => toDayStats(d.id, d.data()));
  }

  /** Per-area counters for the range (one doc per area per day). */
  async areaDays(from: string, to: string): Promise<DayStats[]> {
    const s = await getDocs(
      query(collection(this.db, AREAS), where('date', '>=', from), where('date', '<=', to)),
    );
    return s.docs.map((d) => toDayStats(d.id, d.data()));
  }

  /** Injection context only. Orders not yet delivered or cancelled (newest first). */
  watchOpenOrders(): Live<Order[]> {
    return liveQuery(
      query(
        collection(this.db, 'orders'),
        where('status', 'in', OPEN),
        orderBy('placedAt', 'desc'),
        limit(200),
      ),
      (s) => s.docs.map((d) => toOrder(d.id, d.data())),
    );
  }

  /** Injection context only. The latest orders, for the live feed. */
  watchLatestOrders(n = 8): Live<Order[]> {
    return liveQuery(
      query(collection(this.db, 'orders'), orderBy('placedAt', 'desc'), limit(n)),
      (s) => s.docs.map((d) => toOrder(d.id, d.data())),
    );
  }

  /** Stock rows below `below` (out of stock included), counted on the server. */
  async lowStockCount(below: number): Promise<number> {
    const s = await getCountFromServer(
      query(collection(this.db, 'inventory'), where('quantity', '<', below)),
    );
    return s.data().count;
  }

  async areaNames(): Promise<Map<string, string>> {
    const s = await getDocs(collection(this.db, 'serviceAreas'));
    return new Map(s.docs.map((d) => [d.id, (d.get('name') as string) ?? d.id]));
  }

  /** Product → top-level category, for category sales. */
  async catalogIndex(): Promise<CatalogIndex> {
    const [cats, products] = await Promise.all([
      getDocs(collection(this.db, 'categories')),
      getDocs(collection(this.db, 'products')),
    ]);
    const parent = new Map(
      cats.docs.map((d) => [d.id, (d.get('parentId') as string | null) ?? null]),
    );
    const top = (id: string): string => {
      let cur = id;
      for (let i = 0; i < 5 && parent.get(cur); i++) cur = parent.get(cur)!;
      return cur;
    };
    return {
      categoryNames: new Map(cats.docs.map((d) => [d.id, (d.get('name') as string) ?? d.id])),
      productCategory: new Map(
        products.docs
          .filter((d) => typeof d.get('categoryId') === 'string')
          .map((d) => [d.id, top(d.get('categoryId') as string)]),
      ),
    };
  }

  /** Refunds created in the range (India days), newest first; capped at 1000. */
  async refunds(from: string, to: string): Promise<RefundLine[]> {
    const start = Timestamp.fromMillis(Date.parse(`${from}T00:00:00+05:30`));
    const end = Timestamp.fromMillis(Date.parse(`${to}T00:00:00+05:30`) + 86_400_000);
    const s = await getDocs(
      query(
        collection(this.db, 'refunds'),
        where('createdAt', '>=', start),
        where('createdAt', '<', end),
        orderBy('createdAt', 'desc'),
        limit(1000),
      ),
    );
    return s.docs.map((d) => ({
      createdAt: d.get('createdAt') instanceof Timestamp ? d.get('createdAt').toDate() : null,
      orderId: (d.get('orderId') as string | null) ?? null,
      amountPaise: Number(d.get('amountPaise')) || 0,
      status: (d.get('status') as string) ?? '',
      reason: (d.get('reason') as string) ?? '',
    }));
  }

  /** Every stock row with its product, variant price and store. */
  async stockLines(): Promise<StockLine[]> {
    const [inv, products, stores] = await Promise.all([
      getDocs(collection(this.db, 'inventory')),
      getDocs(collection(this.db, 'products')),
      getDocs(collection(this.db, 'stores')),
    ]);
    const storeNames = new Map(stores.docs.map((d) => [d.id, (d.get('name') as string) ?? d.id]));
    const variants = new Map<string, { product: string; label: string; pricePaise: number }>();
    for (const p of products.docs) {
      const name = (p.get('name') as string) ?? p.id;
      for (const v of (p.get('variants') as Record<string, unknown>[] | undefined) ?? []) {
        if (typeof v['id'] !== 'string') continue;
        variants.set(v['id'], {
          product: name,
          label: (v['label'] as string) ?? '',
          pricePaise: Number(v['pricePaise']) || 0,
        });
      }
    }
    return inv.docs.map((d) => {
      const v = variants.get((d.get('variantId') as string) ?? '');
      return {
        product: v?.product ?? ((d.get('productId') as string) || 'Unknown product'),
        variant: v?.label ?? '',
        store: storeNames.get((d.get('storeId') as string) ?? '') ?? '',
        quantity: Number(d.get('quantity')) || 0,
        pricePaise: v?.pricePaise ?? 0,
      };
    });
  }

  private daysQuery(from: string, to: string) {
    return query(
      collection(this.db, DAILY),
      where(documentId(), '>=', from),
      where(documentId(), '<=', to),
      orderBy(documentId()),
    );
  }
}
