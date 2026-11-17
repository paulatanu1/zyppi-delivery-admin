import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSkeletonModule } from 'ng-zorro-antd/skeleton';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzTimelineModule } from 'ng-zorro-antd/timeline';
import { AuthService } from '../../core/auth/auth.service';
import { hasRole } from '../../core/auth/roles';
import { RupeesPipe } from '../../shared/pipes/rupees.pipe';
import { WhenPipe } from '../../shared/pipes/when.pipe';
import { RidersApi } from '../riders/riders.api';
import { Rider } from '../riders/riders.models';
import { downloadInvoice, printPackingSlip } from './invoice';
import { Customer, OrdersApi, REFUND_META, Refund } from './orders.api';
import {
  CANCEL_REASONS,
  Order,
  OrderEvent,
  STATUS_META,
  isOnline,
  navigateUrl,
} from './orders.models';

/** One order: timeline, customer, items, bill, payment/refunds and actions. */
@Component({
  selector: 'z-order-drawer',
  imports: [
    FormsModule,
    NzAlertModule,
    NzButtonModule,
    NzDrawerModule,
    NzIconModule,
    NzInputModule,
    NzInputNumberModule,
    NzModalModule,
    NzSelectModule,
    NzSkeletonModule,
    NzTagModule,
    NzCheckboxModule,
    NzTimelineModule,
    RupeesPipe,
    WhenPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './order-drawer.html',
  styles: `
    .section {
      padding: 16px 0;
      border-top: 1px solid var(--z-line);
    }
    .thumb {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      object-fit: contain;
      background: var(--z-surface-2);
      flex: none;
    }
    .bill {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 6px 16px;
    }
  `,
})
export class OrderDrawer {
  private readonly api = inject(OrdersApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(NzMessageService);
  private readonly riders = inject(RidersApi);

  readonly orderId = input<string | null>(null);
  readonly areaNames = input<Map<string, string>>(new Map());
  readonly closed = output<void>();

  readonly order = signal<Order | null | undefined>(undefined);
  readonly events = signal<OrderEvent[]>([]);
  readonly refunds = signal<Refund[]>([]);
  readonly customer = signal<Customer | null>(null);
  readonly busy = signal<string | null>(null);

  readonly riderName = signal('');
  readonly riderPhone = signal('');
  /** Approved riders (loaded once per drawer open); '__manual' = someone else. */
  readonly riderList = signal<Rider[]>([]);
  readonly riderChoice = signal<string | null>(null);

  readonly cancelOpen = signal(false);
  readonly cancelPreset = signal<string | null>(null);
  readonly cancelText = signal('');
  readonly refundOpen = signal(false);
  readonly refundRupees = signal<number | null>(null);
  readonly refundReason = signal('');
  readonly dialogError = signal<string | null>(null);
  readonly returnLine = signal<number | null>(null);
  readonly returnQty = signal(1);
  readonly returnFault = signal(true);
  readonly returnReason = signal('');

  readonly meta = STATUS_META;
  readonly refundMeta = REFUND_META;
  readonly cancelOptions = [...CANCEL_REASONS, 'Other'].map((r) => ({ label: r, value: r }));
  readonly width = computed(() => (globalThis.innerWidth < 760 ? '100%' : 620));
  readonly canOperate = computed(() => hasRole(this.auth.role(), ['ops']));
  readonly canRefund = computed(() => hasRole(this.auth.role(), ['finance']));
  readonly canReturn = computed(() => hasRole(this.auth.role(), ['ops', 'finance']));
  readonly area = computed(() => {
    const o = this.order();
    return o ? (this.areaNames().get(o.serviceAreaId) ?? o.serviceAreaId) : '';
  });
  readonly navigate = computed(() => navigateUrl(this.order()?.address ?? null));
  readonly refundable = computed(() => {
    const o = this.order();
    if (!o || !isOnline(o) || o.paymentStatus !== 'succeeded') return 0;
    return Math.max(0, o.totalPaise - o.refundedPaise);
  });
  /** Riders of the order's area first, then the rest. */
  readonly riderOptions = computed(() => {
    const area = this.order()?.serviceAreaId;
    const list = [...this.riderList()].sort(
      (a, b) => Number(b.serviceAreaId === area) - Number(a.serviceAreaId === area),
    );
    return [
      ...list.map((r) => ({
        label: `${r.fullName} · ${r.phone}${r.serviceAreaId === area ? '' : ' (other area)'}`,
        value: r.uid,
      })),
      { label: 'Someone else (type name & phone)', value: '__manual' },
    ];
  });
  readonly cancelReason = computed(() =>
    this.cancelPreset() === 'Other' ? this.cancelText().trim() : (this.cancelPreset() ?? ''),
  );

  constructor() {
    let stops: (() => void)[] = [];
    const stopAll = () => {
      stops.forEach((s) => s());
      stops = [];
    };
    effect(() => {
      const id = this.orderId();
      stopAll();
      this.order.set(undefined);
      this.events.set([]);
      this.refunds.set([]);
      this.customer.set(null);
      if (!id) return;
      let firstLoad = true;
      stops.push(
        this.api.listenOrder(
          id,
          (o) => {
            this.order.set(o);
            if (o && firstLoad) {
              firstLoad = false;
              this.riderName.set(o.riderName ?? '');
              this.riderPhone.set(o.riderPhone ?? '');
              this.riderChoice.set(o.riderId ?? (o.riderName ? '__manual' : null));
              if (this.canOperate()) {
                void this.riders
                  .approved()
                  .then((r) => this.riderList.set(r))
                  .catch(() => undefined);
              }
              void this.api.customer(o.userId).then((c) => this.customer.set(c));
            }
          },
          () => this.order.set(null),
        ),
        this.api.listenEvents(id, (e) => this.events.set(e)),
        this.api.listenRefunds(id, (r) => this.refunds.set(r)),
      );
    });
    inject(DestroyRef).onDestroy(stopAll);
  }

  eventLabel(e: OrderEvent): string {
    return STATUS_META[e.status]?.label ?? e.status;
  }

  async advance(): Promise<void> {
    const o = this.order();
    const next = o && STATUS_META[o.status].next;
    if (!o || !next) return;
    await this.run('advance', async () => {
      await this.api.updateStatus({ orderId: o.id, status: next });
      this.toast.success(`#${o.shortId}: ${STATUS_META[next].label}`);
    });
  }

  async saveRider(): Promise<void> {
    const o = this.order();
    const choice = this.riderChoice();
    if (!o) return;
    await this.run('rider', async () => {
      if (choice && choice !== '__manual') {
        await this.api.updateStatus({ orderId: o.id, status: o.status, riderId: choice });
      } else {
        await this.api.updateStatus({
          orderId: o.id,
          status: o.status,
          riderId: null,
          riderName: choice ? this.riderName() : '',
          riderPhone: choice ? this.riderPhone() : '',
        });
      }
      this.toast.success(choice ? 'Rider assigned' : 'Rider removed');
    });
  }

  openCancel(): void {
    this.cancelPreset.set(null);
    this.cancelText.set('');
    this.dialogError.set(null);
    this.cancelOpen.set(true);
  }

  async confirmCancel(): Promise<void> {
    const o = this.order();
    const reason = this.cancelReason();
    if (!o) return;
    if (reason.length < 3) {
      this.dialogError.set('Choose or type a reason.');
      return;
    }
    await this.run(
      'cancel',
      async () => {
        const res = await this.api.updateStatus({ orderId: o.id, status: 'cancelled', reason });
        this.cancelOpen.set(false);
        this.toast.success(
          res.refund
            ? `#${o.shortId} cancelled · refund ${REFUND_META[res.refund.status as Refund['status']]?.label.toLowerCase() ?? res.refund.status}`
            : `#${o.shortId} cancelled · stock returned`,
        );
      },
      true,
    );
  }

  /** Units of line [index] that can still be returned. */
  returnable(index: number): number {
    const o = this.order();
    const item = o?.items[index];
    return item ? item.quantity - (o!.returns[String(index)] ?? 0) : 0;
  }

  openReturn(index: number): void {
    this.returnLine.set(index);
    this.returnQty.set(1);
    this.returnFault.set(true);
    this.returnReason.set('');
    this.dialogError.set(null);
  }

  async confirmReturn(): Promise<void> {
    const o = this.order();
    const index = this.returnLine();
    if (!o || index === null) return;
    const qty = Math.floor(this.returnQty() ?? 0);
    if (qty < 1 || qty > this.returnable(index)) {
      this.dialogError.set(`Enter 1 to ${this.returnable(index)} units.`);
      return;
    }
    if (this.returnReason().trim().length < 3) {
      this.dialogError.set('Give a reason (the seller sees it).');
      return;
    }
    await this.run(
      'return',
      async () => {
        const res = await this.api.returnItem({
          orderId: o.id,
          index,
          quantity: qty,
          sellerAtFault: this.returnFault(),
          reason: this.returnReason().trim(),
        });
        this.returnLine.set(null);
        this.toast.success(
          res.debitPaise
            ? `Recorded. ₹${(res.debitPaise / 100).toFixed(2)} taken back from the seller. Refund the customer with Refund…`
            : 'Recorded. Refund the customer with Refund… if needed.',
        );
      },
      true,
    );
  }

  openRefund(): void {
    this.refundRupees.set(this.refundable() / 100);
    this.refundReason.set('');
    this.dialogError.set(null);
    this.refundOpen.set(true);
  }

  async confirmRefund(): Promise<void> {
    const o = this.order();
    const paise = Math.round((this.refundRupees() ?? 0) * 100);
    if (!o) return;
    if (paise <= 0 || paise > this.refundable()) {
      this.dialogError.set('Enter an amount up to what can still be refunded.');
      return;
    }
    if (this.refundReason().trim().length < 3) {
      this.dialogError.set('Give a reason.');
      return;
    }
    await this.run(
      'refund',
      async () => {
        const res = await this.api.refund(o.id, paise, this.refundReason().trim());
        this.refundOpen.set(false);
        this.toast.success(
          `Refund ${REFUND_META[res.status as Refund['status']]?.label.toLowerCase() ?? res.status}`,
        );
      },
      true,
    );
  }

  async refresh(r: Refund): Promise<void> {
    await this.run(`refund-${r.id}`, async () => {
      const res = await this.api.refreshRefund(r.id);
      this.toast.info(
        `Refund: ${REFUND_META[res.status as Refund['status']]?.label ?? res.status}`,
      );
    });
  }

  async invoice(): Promise<void> {
    const o = this.order();
    if (o) await this.run('invoice', () => downloadInvoice(o, this.customer(), this.area()));
  }

  async slip(): Promise<void> {
    const o = this.order();
    if (o) await this.run('slip', () => printPackingSlip(o, this.area()));
  }

  private async run(key: string, task: () => Promise<void>, inDialog = false): Promise<void> {
    this.busy.set(key);
    this.dialogError.set(null);
    try {
      await task();
    } catch (e) {
      const msg = (e as Error).message;
      if (inDialog) this.dialogError.set(msg);
      else this.toast.error(msg);
    } finally {
      this.busy.set(null);
    }
  }
}
