import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSegmentedModule } from 'ng-zorro-antd/segmented';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { LoadStatus, friendlyFirestoreError } from '../../core/firebase/live';
import { Chart, ChartOptions } from '../../shared/charts/chart';
import { PageHeader } from '../../shared/ui/page-header';
import { PageState } from '../../shared/ui/page-state';
import { LOW_STOCK } from '../catalog/catalog.models';
import { methodChart, ordersGmvChart, rankChart } from './charts';
import { exportCsv, exportPdf, exportXlsx, formatCell } from './export';
import {
  CatalogIndex,
  Column,
  RefundLine,
  ReportTable,
  StockLine,
  areaReport,
  categoryReport,
  couponReport,
  customerReport,
  inventoryReport,
  paymentReport,
  productReport,
  refundReport,
  riderReport,
  salesReport,
} from './reports.models';
import { StatsApi } from './stats.api';
import { DayStats, Grain, addDays, daysBetween, istDay, series, sumDays } from './stats.models';

export type ReportKey =
  | 'sales'
  | 'areas'
  | 'products'
  | 'categories'
  | 'coupons'
  | 'payments'
  | 'refunds'
  | 'riders'
  | 'customers'
  | 'inventory';

export const REPORT_TABS: { key: ReportKey; label: string }[] = [
  { key: 'sales', label: 'Sales' },
  { key: 'areas', label: 'Areas' },
  { key: 'products', label: 'Products' },
  { key: 'categories', label: 'Categories' },
  { key: 'coupons', label: 'Coupons' },
  { key: 'payments', label: 'Payments' },
  { key: 'refunds', label: 'Refunds' },
  { key: 'riders', label: 'Riders' },
  { key: 'customers', label: 'Customers' },
  { key: 'inventory', label: 'Inventory' },
];

/** Tabs that use the day / week / month switch. */
const GRAINED: ReportKey[] = ['sales', 'customers'];
const MAX_DAYS = 366;

/** Local-calendar Date → yyyy-mm-dd (the picker works in the browser's zone). */
export function dayOf(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function dateOf(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export interface Preset {
  label: string;
  range: () => [string, string];
}

export const PRESETS: Preset[] = [
  { label: 'Today', range: () => [istDay(), istDay()] },
  { label: 'Last 7 days', range: () => [addDays(istDay(), -6), istDay()] },
  { label: 'Last 30 days', range: () => [addDays(istDay(), -29), istDay()] },
  { label: 'This month', range: () => [`${istDay().slice(0, 7)}-01`, istDay()] },
  {
    label: 'Last month',
    range: () => {
      const first = `${istDay().slice(0, 7)}-01`;
      const end = addDays(first, -1);
      return [`${end.slice(0, 7)}-01`, end];
    },
  },
];

/**
 * Reports from `stats/*` (one doc per day, plus one per area per day) and
 * a few bounded reads (refunds in the range, the catalogue, stock). Every
 * report exports to XLSX, CSV and PDF exactly as shown.
 */
@Component({
  selector: 'z-reports-page',
  imports: [
    Chart,
    FormsModule,
    NzButtonModule,
    NzDatePickerModule,
    NzIconModule,
    NzSegmentedModule,
    NzTableModule,
    NzTabsModule,
    PageHeader,
    PageState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reports-page.html',
  styles: `
    .total td {
      font-weight: 800;
      background: var(--z-surface-2);
    }
  `,
})
export class ReportsPage {
  private readonly api = inject(StatsApi);
  private readonly message = inject(NzMessageService);

  protected readonly tabs = REPORT_TABS;
  protected readonly presets = PRESETS;
  protected readonly cell = formatCell;
  protected readonly grainOptions = [
    { label: 'Daily', value: 'day' },
    { label: 'Weekly', value: 'week' },
    { label: 'Monthly', value: 'month' },
  ];

  readonly from = signal(addDays(istDay(), -29));
  readonly to = signal(istDay());
  readonly grain = signal<Grain>('day');
  readonly tabIndex = signal(0);
  readonly tab = computed(() => REPORT_TABS[this.tabIndex()].key);
  readonly grained = computed(() => GRAINED.includes(this.tab()));

  readonly status = signal<LoadStatus>('loading');
  readonly error = signal<string | null>(null);
  readonly days = signal<DayStats[]>([]);
  readonly areaDays = signal<DayStats[]>([]);
  readonly refunds = signal<RefundLine[]>([]);
  readonly areaNames = signal(new Map<string, string>());

  /** Loaded the first time their tab opens. */
  readonly catalog = signal<CatalogIndex | null>(null);
  readonly stock = signal<StockLine[] | null>(null);
  readonly sideStatus = signal<LoadStatus>('ready');
  readonly sideError = signal<string | null>(null);

  readonly exporting = signal<string | null>(null);

  readonly pickerValue = computed(() => [dateOf(this.from()), dateOf(this.to())]);
  private readonly total = computed(() => sumDays(this.days()));

  readonly report = computed<ReportTable | null>(() => {
    const [from, to, grain] = [this.from(), this.to(), this.grain()];
    const t = this.total();
    switch (this.tab()) {
      case 'sales':
        return salesReport(this.days(), from, to, grain);
      case 'areas':
        return areaReport(this.areaDays(), this.areaNames(), from, to);
      case 'products':
        return productReport(t, from, to);
      case 'categories': {
        const c = this.catalog();
        return c ? categoryReport(t, c, from, to) : null;
      }
      case 'coupons':
        return couponReport(t, from, to);
      case 'payments':
        return paymentReport(t, from, to);
      case 'refunds':
        return refundReport(this.refunds(), from, to);
      case 'riders':
        return riderReport(t, from, to);
      case 'customers':
        return customerReport(this.days(), from, to, grain);
      case 'inventory': {
        const s = this.stock();
        return s
          ? inventoryReport(s, LOW_STOCK, `As of ${new Date().toLocaleString('en-IN')}`)
          : null;
      }
    }
  });

  /** The chart above the table, where one helps. */
  readonly chart = computed<ChartOptions | null>(() => {
    const r = this.report();
    if (!r || r.rows.length === 0) return null;
    const pairs = (name: string, value: string) =>
      r.rows.slice(0, 10).map((x) => ({ name: String(x[name]), value: Number(x[value]) || 0 }));
    switch (this.tab()) {
      case 'sales':
        return ordersGmvChart(
          series(this.days(), this.from(), this.to(), this.grain()),
          this.grain(),
        );
      case 'areas':
        return rankChart(pairs('area', 'gmv'), true, 1);
      case 'products':
        return rankChart(pairs('product', 'sales'), true, 2);
      case 'categories':
        return rankChart(pairs('category', 'sales'), true, 4);
      case 'payments':
        return methodChart(this.total());
      case 'riders':
        return rankChart(pairs('rider', 'delivered'), false, 0);
      default:
        return null;
    }
  });

  /** Side data (catalogue, stock) for the open tab is still loading or failed. */
  readonly needsSide = computed(
    () =>
      (this.tab() === 'categories' && !this.catalog()) ||
      (this.tab() === 'inventory' && !this.stock()),
  );

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    const [from, to] = [this.from(), this.to()];
    this.status.set('loading');
    this.error.set(null);
    try {
      const [days, areaDays, refunds, names] = await Promise.all([
        this.api.days(from, to),
        this.api.areaDays(from, to),
        this.api.refunds(from, to),
        this.areaNames().size ? Promise.resolve(this.areaNames()) : this.api.areaNames(),
      ]);
      // A newer range was picked while this one loaded.
      if (from !== this.from() || to !== this.to()) return;
      this.days.set(days);
      this.areaDays.set(areaDays);
      this.refunds.set(refunds);
      this.areaNames.set(names);
      this.status.set('ready');
    } catch (e) {
      this.error.set(friendlyFirestoreError(e));
      this.status.set('error');
    }
  }

  async loadSide(): Promise<void> {
    const tab = this.tab();
    if (tab !== 'categories' && tab !== 'inventory') return;
    if ((tab === 'categories' && this.catalog()) || (tab === 'inventory' && this.stock())) return;
    this.sideStatus.set('loading');
    this.sideError.set(null);
    try {
      if (tab === 'categories') this.catalog.set(await this.api.catalogIndex());
      else this.stock.set(await this.api.stockLines());
      this.sideStatus.set('ready');
    } catch (e) {
      this.sideError.set(friendlyFirestoreError(e));
      this.sideStatus.set('error');
    }
  }

  selectTab(i: number): void {
    this.tabIndex.set(i);
    void this.loadSide();
  }

  setRange(from: string, to: string): void {
    if (from > to) [from, to] = [to, from];
    if (daysBetween(from, to).length > MAX_DAYS) {
      this.message.warning('Pick a range of up to a year.');
      return;
    }
    this.from.set(from);
    this.to.set(to);
    void this.load();
  }

  onPicker(v: Date[] | null): void {
    if (v?.length === 2 && v[0] && v[1]) this.setRange(dayOf(v[0]), dayOf(v[1]));
  }

  applyPreset(p: Preset): void {
    const [from, to] = p.range();
    this.setRange(from, to);
  }

  isPreset(p: Preset): boolean {
    const [from, to] = p.range();
    return from === this.from() && to === this.to();
  }

  /** No picking days after today. */
  readonly disabledDate = (d: Date) => dayOf(d) > istDay();

  /** Alignment for numeric columns. */
  align(c: Column): 'left' | 'right' {
    return c.kind === 'text' ? 'left' : 'right';
  }

  async export(kind: 'xlsx' | 'csv' | 'pdf'): Promise<void> {
    const r = this.report();
    if (!r) return;
    this.exporting.set(kind);
    try {
      if (kind === 'xlsx') await exportXlsx(r);
      else if (kind === 'csv') await exportCsv(r);
      else await exportPdf(r);
    } catch {
      this.message.error('Couldn’t create the file. Please try again.');
    } finally {
      this.exporting.set(null);
    }
  }
}
