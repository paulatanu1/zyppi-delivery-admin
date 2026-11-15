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
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzImageModule } from 'ng-zorro-antd/image';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzSkeletonModule } from 'ng-zorro-antd/skeleton';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { AuthService } from '../../core/auth/auth.service';
import { hasRole } from '../../core/auth/roles';
import { RupeesPipe } from '../../shared/pipes/rupees.pipe';
import { WhenPipe } from '../../shared/pipes/when.pipe';
import { shortOrderId } from '../orders/orders.models';
import { CashEntry, RiderEvent, RidersApi, ReviewAction } from './riders.api';
import {
  CHECKLIST,
  DOCS,
  PayoutInput,
  Rider,
  RiderStatus,
  STATUS_META,
  ageOn,
  isMotor,
  onTimePercent,
  vehicleLabel,
} from './riders.models';

const RESULT: Record<ReviewAction, RiderStatus> = {
  approve: 'approved',
  reject: 'rejected',
  request_changes: 'changes_requested',
  suspend: 'suspended',
  reinstate: 'approved',
};

interface DocView {
  key: string;
  label: string;
  url: string | null;
  pdf: boolean;
}

const ACTION_COPY: Record<
  ReviewAction,
  { title: string; ok: string; danger?: boolean; reason: boolean; placeholder?: string }
> = {
  approve: { title: 'Approve this rider?', ok: 'Approve', reason: false },
  reject: {
    title: 'Reject application',
    ok: 'Reject',
    danger: true,
    reason: true,
    placeholder: 'e.g. Driving licence has expired',
  },
  request_changes: {
    title: 'Ask for changes',
    ok: 'Send to rider',
    reason: true,
    placeholder: 'e.g. Selfie is blurry, please upload a clear one',
  },
  suspend: {
    title: 'Suspend rider',
    ok: 'Suspend',
    danger: true,
    reason: true,
    placeholder: 'e.g. Repeated late deliveries',
  },
  reinstate: { title: 'Reinstate rider?', ok: 'Reinstate', reason: false },
};

@Component({
  selector: 'z-rider-drawer',
  imports: [
    FormsModule,
    NzAlertModule,
    NzButtonModule,
    NzCheckboxModule,
    NzDrawerModule,
    NzIconModule,
    NzImageModule,
    NzInputModule,
    NzInputNumberModule,
    NzModalModule,
    NzSkeletonModule,
    NzTagModule,
    RupeesPipe,
    WhenPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rider-drawer.html',
  styles: `
    .section {
      padding: 16px 0;
      border-top: 1px solid var(--z-line);
    }
    .facts {
      display: grid;
      grid-template-columns: 140px 1fr;
      gap: 6px 12px;
    }
    .docs {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 12px;
    }
    .doc {
      border: 1px solid var(--z-line);
      border-radius: var(--z-radius-tile);
      overflow: hidden;
      background: var(--z-surface-2);
    }
    .doc img {
      width: 100%;
      height: 120px;
      object-fit: cover;
      cursor: zoom-in;
    }
  `,
})
export class RiderDrawer {
  private readonly api = inject(RidersApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(NzMessageService);

  readonly uid = input<string | null>(null);
  readonly areaNames = input<Map<string, string>>(new Map());
  readonly closed = output<void>();

  readonly rider = signal<Rider | null | undefined>(undefined);
  readonly docs = signal<DocView[]>([]);
  readonly events = signal<RiderEvent[]>([]);
  readonly cash = signal<CashEntry[]>([]);
  readonly payout = signal<PayoutInput | null>(null);
  readonly checks = signal<Record<string, boolean>>({});
  readonly busy = signal(false);

  readonly action = signal<ReviewAction | null>(null);
  readonly reason = signal('');
  readonly settleOpen = signal(false);
  readonly settleRupees = signal<number | null>(null);
  readonly settleNote = signal('');
  readonly dialogError = signal<string | null>(null);

  readonly meta = STATUS_META;
  readonly copy = ACTION_COPY;
  readonly vehicle = vehicleLabel;
  readonly onTime = onTimePercent;
  readonly short = shortOrderId;
  readonly width = computed(() => (globalThis.innerWidth < 760 ? '100%' : 680));
  readonly canReview = computed(() => hasRole(this.auth.role(), ['ops']));
  readonly canSettle = computed(() => hasRole(this.auth.role(), ['finance', 'ops']));
  readonly checklist = computed(() => {
    const motor = isMotor(this.rider()?.vehicleType ?? '');
    return CHECKLIST.filter((c) => motor || !['licenceValid', 'rcMatches'].includes(c.key));
  });
  readonly allChecked = computed(() => this.checklist().every((c) => this.checks()[c.key]));
  readonly age = computed(() => {
    const a = ageOn(this.rider()?.dob ?? '');
    return Number.isNaN(a) ? '' : `${a} years`;
  });

  constructor() {
    let stops: (() => void)[] = [];
    const stopAll = () => {
      stops.forEach((s) => s());
      stops = [];
    };
    effect(() => {
      const uid = this.uid();
      stopAll();
      this.rider.set(undefined);
      this.docs.set([]);
      this.payout.set(null);
      if (!uid) return;
      let first = true;
      stops.push(
        this.api.listenRider(
          uid,
          (r) => {
            this.rider.set(r);
            if (r && first) {
              first = false;
              this.checks.set({ ...r.checklist });
              void this.loadDocs(r);
              void this.api.payout(uid).then((p) => this.payout.set(p));
            }
          },
          () => this.rider.set(null),
        ),
        this.api.listenEvents(uid, (e) => this.events.set(e)),
        this.api.listenCash(uid, (c) => this.cash.set(c)),
      );
    });
    inject(DestroyRef).onDestroy(stopAll);
  }

  private async loadDocs(r: Rider): Promise<void> {
    const views = await Promise.all(
      DOCS.filter((d) => r.docs[d.key]).map(async (d) => {
        const path = r.docs[d.key]!;
        const url = await this.api.docUrl(path).catch(() => null);
        return { key: d.key, label: d.label, url, pdf: path.endsWith('.pdf') };
      }),
    );
    this.docs.set(views);
  }

  toggleCheck(key: string, on: boolean): void {
    this.checks.update((c) => ({ ...c, [key]: on }));
  }

  ask(action: ReviewAction): void {
    this.reason.set('');
    this.dialogError.set(null);
    this.action.set(action);
  }

  async confirm(): Promise<void> {
    const r = this.rider();
    const action = this.action();
    if (!r || !action) return;
    if (ACTION_COPY[action].reason && this.reason().trim().length < 3) {
      this.dialogError.set('Write a short reason — the rider will see it.');
      return;
    }
    this.busy.set(true);
    try {
      await this.api.review(r.uid, action, this.reason().trim(), this.checks());
      this.toast.success(`${r.fullName}: ${STATUS_META[RESULT[action]].label}`);
      this.action.set(null);
    } catch (e) {
      this.dialogError.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  openSettle(): void {
    const r = this.rider();
    this.settleRupees.set(r ? r.codBalancePaise / 100 : null);
    this.settleNote.set('');
    this.dialogError.set(null);
    this.settleOpen.set(true);
  }

  async settle(): Promise<void> {
    const r = this.rider();
    const paise = Math.round((this.settleRupees() ?? 0) * 100);
    if (!r) return;
    if (paise <= 0 || paise > r.codBalancePaise) {
      this.dialogError.set('Enter an amount up to the cash the rider holds.');
      return;
    }
    this.busy.set(true);
    try {
      await this.api.settleCash(r.uid, paise, this.settleNote().trim());
      this.toast.success('Cash recorded');
      this.settleOpen.set(false);
    } catch (e) {
      this.dialogError.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  eventLabel(t: string): string {
    return (
      (
        {
          submitted: 'Applied',
          approve: 'Approved',
          reject: 'Rejected',
          request_changes: 'Changes requested',
          suspend: 'Suspended',
          reinstate: 'Reinstated',
        } as Record<string, string>
      )[t] ?? t
    );
  }
}
