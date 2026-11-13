import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { collection, getDocs } from 'firebase/firestore';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzNotificationService } from 'ng-zorro-antd/notification';
import { NzSegmentedModule } from 'ng-zorro-antd/segmented';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { FIRESTORE } from '../../core/firebase/firebase';
import { LoadStatus, friendlyFirestoreError } from '../../core/firebase/live';
import { RupeesPipe, formatPaise } from '../../shared/pipes/rupees.pipe';
import { WhenPipe } from '../../shared/pipes/when.pipe';
import { PageHeader } from '../../shared/ui/page-header';
import { PageState } from '../../shared/ui/page-state';
import { OrderDrawer } from './order-drawer';
import { OrdersApi } from './orders.api';
import { BOARD_COLUMNS, Order, OrderStatus, STATUS_META, ago } from './orders.models';

type Range = 'today' | 'yesterday' | '7d' | '30d';
type View = 'board' | 'list';

const SOUND_KEY = 'zyppi-admin.orderSound';

@Component({
  selector: 'z-orders-page',
  imports: [
    FormsModule,
    NzBadgeModule,
    NzButtonModule,
    NzIconModule,
    NzInputModule,
    NzSegmentedModule,
    NzSelectModule,
    NzSwitchModule,
    NzTableModule,
    NzTagModule,
    RupeesPipe,
    WhenPipe,
    PageHeader,
    PageState,
    OrderDrawer,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './orders-page.html',
  styleUrl: './orders-page.scss',
})
export class OrdersPage {
  private readonly api = inject(OrdersApi);
  private readonly db = inject(FIRESTORE);
  private readonly router = inject(Router);
  private readonly notify = inject(NzNotificationService);

  /** /orders/:id deep link opens the drawer. */
  readonly id = input<string | undefined>();

  readonly view = signal<View>('board');
  readonly range = signal<Range>('today');
  readonly areaFilter = signal<string | null>(null);
  readonly paymentFilter = signal<'all' | 'cod' | 'online'>('all');
  readonly search = signal('');
  readonly sound = signal(readSound());
  readonly now = signal(Date.now());

  readonly orders = signal<Order[] | null>(null);
  readonly error = signal<string | null>(null);
  readonly areaNames = signal(new Map<string, string>());

  readonly status = computed<LoadStatus>(() =>
    this.error() ? 'error' : this.orders() ? 'ready' : 'loading',
  );

  readonly viewOptions = [
    { label: 'Board', value: 'board', icon: 'appstore' },
    { label: 'List', value: 'list', icon: 'menu' },
  ];
  readonly rangeOptions = [
    { label: 'Today', value: 'today' },
    { label: 'Yesterday', value: 'yesterday' },
    { label: '7 days', value: '7d' },
    { label: '30 days', value: '30d' },
  ];
  readonly paymentOptions = [
    { label: 'All payments', value: 'all' },
    { label: 'Cash on delivery', value: 'cod' },
    { label: 'Online (UPI / card)', value: 'online' },
  ];
  readonly meta = STATUS_META;
  readonly columns = BOARD_COLUMNS;

  readonly areaOptions = computed(() =>
    [...this.areaNames()].map(([value, label]) => ({ label, value })),
  );

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase().replace(/^#/, '');
    const area = this.areaFilter();
    const pay = this.paymentFilter();
    const end = rangeEnd(this.range());
    return (this.orders() ?? []).filter(
      (o) =>
        (!end || (o.placedAt?.toMillis() ?? 0) < end) &&
        (!area || o.serviceAreaId === area) &&
        (pay === 'all' || (pay === 'cod') === (o.paymentMethod === 'Cash on delivery')) &&
        (!q ||
          o.shortId.toLowerCase().includes(q) ||
          o.addressText.toLowerCase().includes(q) ||
          (o.riderName ?? '').toLowerCase().includes(q)),
    );
  });

  readonly byStatus = computed(() => {
    const map = new Map<OrderStatus, Order[]>();
    for (const s of [...BOARD_COLUMNS, 'cancelled' as OrderStatus]) map.set(s, []);
    for (const o of this.filtered()) map.get(o.status)?.push(o);
    // Oldest first in active columns: the one waiting longest is on top.
    for (const s of ['placed', 'packed', 'out_for_delivery'] as OrderStatus[])
      map.get(s)!.reverse();
    return map;
  });

  readonly totals = computed(() => {
    const live = this.filtered().filter((o) => o.status !== 'cancelled');
    return {
      count: live.length,
      gmv: live.reduce((s, o) => s + o.totalPaise, 0),
      open: live.filter((o) => o.status !== 'delivered').length,
      cancelled: this.filtered().length - live.length,
    };
  });

  constructor() {
    void this.loadAreas();
    let stop: (() => void) | null = null;
    let known: Set<string> | null = null;
    effect(() => {
      const from = rangeStart(this.range());
      stop?.();
      this.orders.set(null);
      this.error.set(null);
      known = null;
      stop = this.api.listen(
        from,
        (orders) => {
          // New orders after the first load → sound + notification.
          if (known) {
            const fresh = orders.filter((o) => !known!.has(o.id) && o.status === 'placed');
            if (fresh.length) this.announce(fresh);
          }
          known = new Set(orders.map((o) => o.id));
          this.orders.set(orders);
        },
        (e) => this.error.set(friendlyFirestoreError(e)),
      );
    });
    const tick = setInterval(() => this.now.set(Date.now()), 30_000);
    const baseTitle = document.title;
    effect(() => {
      const waiting = this.byStatus().get('placed')?.length ?? 0;
      document.title = waiting ? `(${waiting}) New orders · Zyppi Admin` : baseTitle;
    });
    inject(DestroyRef).onDestroy(() => {
      stop?.();
      clearInterval(tick);
      document.title = baseTitle;
    });
  }

  private async loadAreas(): Promise<void> {
    try {
      const s = await getDocs(collection(this.db, 'serviceAreas'));
      this.areaNames.set(new Map(s.docs.map((d) => [d.id, (d.get('name') as string) ?? d.id])));
    } catch {
      // Area names are a nicety; ids still filter.
    }
  }

  private announce(fresh: Order[]): void {
    if (this.sound()) chime();
    const o = fresh[0];
    this.notify.info(
      fresh.length > 1 ? `${fresh.length} new orders` : `New order #${o.shortId}`,
      `${o.items.length} items · ${formatPaise(o.totalPaise)} · ${this.areaNames().get(o.serviceAreaId) ?? ''}`,
      { nzDuration: 8000 },
    );
  }

  toggleSound(on: boolean): void {
    this.sound.set(on);
    try {
      localStorage.setItem(SOUND_KEY, on ? '1' : '0');
    } catch {
      // Remembered for this tab only.
    }
    if (on) chime();
  }

  open(o: Order): void {
    void this.router.navigate(['/orders', o.id]);
  }

  close(): void {
    void this.router.navigate(['/orders']);
  }

  waited(o: Order): string {
    this.now();
    return ago(o.placedAt);
  }

  late(o: Order): boolean {
    const min = o.placedAt ? (this.now() - o.placedAt.toMillis()) / 60000 : 0;
    return o.status !== 'delivered' && o.status !== 'cancelled' && min > (o.etaMinutes ?? 30);
  }

  areaName(id: string): string {
    return this.areaNames().get(id) ?? '';
  }

  retry(): void {
    const r = this.range();
    this.range.set(r === 'today' ? '7d' : 'today');
    queueMicrotask(() => this.range.set(r));
  }
}

function startOfDay(offsetDays = 0): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offsetDays);
  return d;
}

function rangeStart(r: Range): Date {
  return startOfDay({ today: 0, yesterday: 1, '7d': 6, '30d': 29 }[r]);
}

function rangeEnd(r: Range): number | null {
  return r === 'yesterday' ? startOfDay(0).getTime() : null;
}

function readSound(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== '0';
  } catch {
    return true;
  }
}

/** Two short tones; no audio file needed. Browsers allow it after a click on the page. */
function chime(): void {
  try {
    const ctx = new AudioContext();
    [880, 1320].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.18);
    });
  } catch {
    // No audio available.
  }
}
