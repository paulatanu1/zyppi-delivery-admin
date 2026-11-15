import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSegmentedModule } from 'ng-zorro-antd/segmented';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { AuthService } from '../../core/auth/auth.service';
import { ROLE_LABELS, hasRole } from '../../core/auth/roles';
import { friendlyFirestoreError } from '../../core/firebase/live';
import { Chart } from '../../shared/charts/chart';
import { RupeesPipe, formatPaise } from '../../shared/pipes/rupees.pipe';
import { WhenPipe } from '../../shared/pipes/when.pipe';
import { PageState } from '../../shared/ui/page-state';
import { chime, closeChime } from '../../shared/util/chime';
import { LOW_STOCK } from '../catalog/catalog.models';
import { STATUS_META } from '../orders/orders.models';
import { hourChart, methodChart, ordersGmvChart, rankChart } from '../reports/charts';
import { productReport } from '../reports/reports.models';
import { StatsApi } from '../reports/stats.api';
import {
  DayStats,
  addDays,
  aov,
  cancelRate,
  istDay,
  series,
  sumDays,
} from '../reports/stats.models';

const SOUND_KEY = 'zyppi-admin.order-sound';

export interface Kpi {
  label: string;
  value: string;
  hint: string;
  tone?: 'warn' | 'danger' | 'ok';
}

/**
 * Today at a glance from `stats/*` (no order scans), the open-order
 * pipeline, and a live feed of new orders with an optional chime.
 */
@Component({
  selector: 'z-dashboard',
  imports: [
    Chart,
    FormsModule,
    NzButtonModule,
    NzIconModule,
    NzSegmentedModule,
    NzSwitchModule,
    NzTagModule,
    PageState,
    RouterLink,
    RupeesPipe,
    WhenPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.html',
  styles: `
    .tone-ok {
      color: var(--z-ok);
    }
    .tone-warn {
      color: var(--z-warn);
    }
    .tone-danger {
      color: var(--z-danger);
    }
  `,
})
export class Dashboard {
  private readonly auth = inject(AuthService);
  private readonly api = inject(StatsApi);

  protected readonly meta = STATUS_META;
  protected readonly today = istDay();
  private readonly from30 = addDays(this.today, -29);

  /** Last 30 days of counters, live (today's doc included). */
  readonly days = this.api.watchDays(this.from30, this.today);
  readonly open = this.api.watchOpenOrders();
  readonly latest = this.api.watchLatestOrders(8);

  readonly span = signal<7 | 14 | 30>(14);
  protected readonly spanOptions = [
    { label: '7 days', value: 7 },
    { label: '14 days', value: 14 },
    { label: '30 days', value: 30 },
  ];
  readonly lowStock = signal<number | null>(null);
  readonly areaRows = signal<{ name: string; value: number }[] | null>(null);
  readonly sideError = signal<string | null>(null);
  readonly sound = signal(readSound());

  readonly roleLabel = computed(() => {
    const r = this.auth.role();
    return r ? ROLE_LABELS[r] : '';
  });

  readonly greeting = computed(() => {
    const h = new Date().getHours();
    const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    const name = this.auth.session()?.displayName?.split(' ')[0];
    return name ? `${part}, ${name}` : part;
  });

  readonly canReports = computed(() => hasRole(this.auth.role(), ['finance', 'ops']));
  readonly canOrders = computed(() => hasRole(this.auth.role(), ['ops', 'support']));

  readonly todayStats = computed<DayStats>(
    () => (this.days.value() ?? []).find((d) => d.date === this.today) ?? sumDays([], this.today),
  );

  private readonly yesterday = computed(
    () => (this.days.value() ?? []).find((d) => d.date === addDays(this.today, -1)) ?? null,
  );

  readonly kpis = computed<Kpi[]>(() => {
    const t = this.todayStats();
    const y = this.yesterday();
    const openReady = this.open.status() === 'ready';
    const open = this.open.value() ?? [];
    const pending = open.filter((o) => o.status !== 'out_for_delivery').length;
    const riders = new Set(
      open.filter((o) => o.status === 'out_for_delivery' && o.riderId).map((o) => o.riderId),
    ).size;
    const low = this.lowStock();
    return [
      {
        label: 'Orders today',
        value: String(t.orders),
        hint: y ? `yesterday ${y.orders}` : 'none yesterday',
      },
      {
        label: 'GMV today',
        value: formatPaise(t.gmvPaise),
        hint: y ? `yesterday ${formatPaise(y.gmvPaise)}` : 'none yesterday',
      },
      {
        label: 'Avg order value',
        value: formatPaise(aov(t)),
        hint: y ? `yesterday ${formatPaise(aov(y))}` : 'none yesterday',
      },
      {
        label: 'To pack or send',
        value: openReady ? String(pending) : '—',
        hint: 'new and packed orders',
        tone: pending > 0 ? 'warn' : undefined,
      },
      {
        label: 'Cancelled today',
        value: String(t.cancelled),
        hint: `${cancelRate(t)}% of placed`,
        tone: t.cancelled > 0 ? 'danger' : undefined,
      },
      {
        label: 'First-time customers',
        value: String(t.newCustomers),
        hint: `${t.repeatOrders} repeat orders`,
        tone: t.newCustomers > 0 ? 'ok' : undefined,
      },
      {
        label: 'Riders on the road',
        value: openReady ? String(riders) : '—',
        hint: 'with an order out for delivery',
      },
      {
        label: 'Low stock',
        value: low == null ? '—' : String(low),
        hint: `store items under ${LOW_STOCK}`,
        tone: low ? 'warn' : undefined,
      },
    ];
  });

  private readonly spanFrom = computed(() => addDays(this.today, -(this.span() - 1)));
  private readonly spanDays = computed(() =>
    (this.days.value() ?? []).filter((d) => d.date >= this.spanFrom()),
  );
  private readonly spanTotal = computed(() => sumDays(this.spanDays()));

  readonly hasOrders = computed(() => this.spanTotal().placed > 0);
  readonly trendChart = computed(() =>
    ordersGmvChart(series(this.spanDays(), this.spanFrom(), this.today, 'day'), 'day'),
  );
  readonly methodChart = computed(() => methodChart(this.spanTotal()));
  readonly hourChart = computed(() => hourChart(this.spanTotal()));
  readonly topProducts = computed(() =>
    productReport(this.spanTotal(), this.spanFrom(), this.today, 8).rows.map((r) => ({
      name: r['product'] as string,
      value: r['sales'] as number,
    })),
  );
  readonly topChart = computed(() => rankChart(this.topProducts(), true, 2));
  readonly areaChart = computed(() => rankChart(this.areaRows() ?? [], true, 1));

  constructor() {
    void this.loadSide();

    // Chime when a new order lands on top of the feed (not on first load).
    let seen: string | null = null;
    effect(() => {
      const top = this.latest.value()?.[0];
      if (!top) return;
      if (seen && top.id !== seen && top.status === 'placed' && this.sound()) chime();
      seen = top.id;
    });
    inject(DestroyRef).onDestroy(closeChime);
  }

  /** Low-stock count and the area comparison (last 30 days); one-shot reads. */
  async loadSide(): Promise<void> {
    this.sideError.set(null);
    try {
      const [low, names, areas] = await Promise.all([
        this.api.lowStockCount(LOW_STOCK),
        this.api.areaNames(),
        this.api.areaDays(this.from30, this.today),
      ]);
      this.lowStock.set(low);
      const by = new Map<string, number>();
      for (const d of areas) if (d.areaId) by.set(d.areaId, (by.get(d.areaId) ?? 0) + d.gmvPaise);
      this.areaRows.set(
        [...by]
          .filter(([, v]) => v > 0)
          .map(([id, value]) => ({ name: names.get(id) ?? id, value })),
      );
    } catch (e) {
      this.sideError.set(friendlyFirestoreError(e));
    }
  }

  retryAll(): void {
    this.days.retry();
    this.open.retry();
    this.latest.retry();
    void this.loadSide();
  }

  toggleSound(on: boolean): void {
    this.sound.set(on);
    try {
      localStorage.setItem(SOUND_KEY, on ? '1' : '0');
    } catch {
      // Storage blocked: the choice lasts for this tab only.
    }
    if (on) chime(); // a click unlocks audio, and confirms it works
  }
}

function readSound(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) === '1';
  } catch {
    return false;
  }
}
