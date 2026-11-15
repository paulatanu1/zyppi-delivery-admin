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
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { RupeesPipe } from '../../shared/pipes/rupees.pipe';
import { PageHeader } from '../../shared/ui/page-header';
import { PageState } from '../../shared/ui/page-state';
import { chime } from '../../shared/util/chime';
import { OrdersApi } from '../orders/orders.api';
import { OrderStatus } from '../orders/orders.models';
import { SettingsApi } from '../settings/settings.api';
import { DispatchApi } from './dispatch.api';
import {
  ACTIVITY_META,
  CANNOT_DELIVER_LABELS,
  QueueOrder,
  SOS_LABELS,
  SosAlert,
  activityOf,
  ago,
  mapsLink,
} from './dispatch.models';

/**
 * Dispatch (ops): orders that need a rider or have a delivery problem,
 * live offers, who's online and what they're doing, and rider SOS alerts
 * (with an alarm).
 */
@Component({
  selector: 'z-dispatch-page',
  imports: [
    FormsModule,
    NzButtonModule,
    NzIconModule,
    NzInputModule,
    NzModalModule,
    NzSelectModule,
    NzTagModule,
    PageHeader,
    PageState,
    RouterLink,
    RupeesPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dispatch-page.html',
  styles: `
    .sos {
      padding: 16px;
      border-radius: var(--z-radius-card);
      background: var(--z-danger-soft);
      color: var(--z-danger);
      border: 2px solid var(--z-danger);
    }
    .sos-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      padding: 10px 0;
      border-top: 1px solid color-mix(in srgb, var(--z-danger) 30%, transparent);
    }
  `,
})
export class DispatchPage {
  private readonly api = inject(DispatchApi);
  private readonly orders = inject(OrdersApi);
  private readonly message = inject(NzMessageService);

  readonly riders = this.api.watchOnlineRiders();
  readonly queue = this.api.watchQueue();
  readonly sos = this.api.watchSos();
  readonly areas = inject(SettingsApi).watchServiceAreas();
  readonly activity = ACTIVITY_META;
  readonly cdLabels = CANNOT_DELIVER_LABELS;
  readonly sosLabels = SOS_LABELS;
  readonly ago = ago;
  readonly activityOf = activityOf;
  readonly mapsLink = mapsLink;

  /** Re-render every few seconds for "x min ago" and offer countdowns. */
  readonly now = signal(Date.now());

  readonly areaNames = computed(
    () => new Map((this.areas.value() ?? []).map((a) => [a.id, a.name])),
  );
  readonly needsRider = computed(() =>
    (this.queue.value() ?? [])
      .filter((o) => o.state === 'unassigned' || o.state === 'issue')
      .sort((a, b) => (a.placedAt?.toMillis() ?? 0) - (b.placedAt?.toMillis() ?? 0)),
  );
  readonly offered = computed(() =>
    (this.queue.value() ?? []).filter((o) => o.state === 'offered'),
  );
  readonly ridersSorted = computed(() => {
    const now = this.now();
    const rank = { idle: 0, offered: 1, delivering: 2, break: 3, stale: 4 };
    return [...(this.riders.value() ?? [])].sort(
      (a, b) => rank[activityOf(a, now)] - rank[activityOf(b, now)] || a.name.localeCompare(b.name),
    );
  });
  readonly freeCount = computed(
    () => this.ridersSorted().filter((r) => activityOf(r, this.now()) === 'idle').length,
  );

  // Assign dialog.
  readonly assigning = signal<QueueOrder | null>(null);
  readonly pickedRider = signal<string | null>(null);
  readonly busy = signal(false);
  readonly riderOptions = computed(() => {
    const o = this.assigning();
    const now = this.now();
    return this.ridersSorted()
      .filter((r) => !o || r.serviceAreaId === o.serviceAreaId)
      .filter((r) => ['idle', 'break', 'stale'].includes(activityOf(r, now)))
      .map((r) => ({
        label: `${r.name} · ${this.activity[activityOf(r, now)].label}`,
        value: r.id,
      }));
  });

  // SOS resolve dialog.
  readonly resolving = signal<SosAlert | null>(null);
  readonly resolveNote = signal('');

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 5000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    // Alarm for new SOS alerts and newly unassigned orders (not on first load).
    let seenSos: Set<string> | null = null;
    let seenQueue: Set<string> | null = null;
    effect(() => {
      const ids = new Set((this.sos.value() ?? []).map((s) => s.id));
      if (seenSos && [...ids].some((id) => !seenSos!.has(id))) chime(true);
      if (this.sos.status() === 'ready') seenSos = ids;
    });
    effect(() => {
      const ids = new Set(this.needsRider().map((o) => o.id));
      if (seenQueue && [...ids].some((id) => !seenQueue!.has(id))) chime();
      if (this.queue.status() === 'ready') seenQueue = ids;
    });
  }

  secondsLeft(o: QueueOrder): number {
    return Math.max(0, Math.round(((o.offerExpiresAt?.toMillis() ?? 0) - this.now()) / 1000));
  }

  openAssign(o: QueueOrder): void {
    this.pickedRider.set(null);
    this.assigning.set(o);
  }

  async assign(): Promise<void> {
    const o = this.assigning();
    const riderId = this.pickedRider();
    if (!o || !riderId) return;
    this.busy.set(true);
    try {
      await this.orders.updateStatus({ orderId: o.id, status: o.status as OrderStatus, riderId });
      this.message.success('Rider assigned; their app shows the order now');
      this.assigning.set(null);
    } catch (e) {
      this.message.error((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  openResolve(a: SosAlert): void {
    this.resolveNote.set('');
    this.resolving.set(a);
  }

  async resolve(): Promise<void> {
    const a = this.resolving();
    if (!a) return;
    this.busy.set(true);
    try {
      await this.api.resolveSos(a.id, this.resolveNote());
      this.message.success('Alert closed');
      this.resolving.set(null);
    } catch (e) {
      this.message.error((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
