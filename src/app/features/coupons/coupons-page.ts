import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
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
import { NzSegmentedModule } from 'ng-zorro-antd/segmented';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { allReady } from '../../core/firebase/live';
import { RupeesPipe } from '../../shared/pipes/rupees.pipe';
import { formatWhen } from '../../shared/pipes/when.pipe';
import { Confirm } from '../../shared/ui/confirm';
import { PageHeader } from '../../shared/ui/page-header';
import { PageState } from '../../shared/ui/page-state';
import { fromLocalInput, toLocalInput } from '../home/home.models';
import { SettingsApi } from '../settings/settings.api';
import { CouponsApi } from './coupons.api';
import {
  COUPON_STATES,
  Coupon,
  CouponDraft,
  CouponState,
  blankCoupon,
  couponProblems,
  couponState,
  describeOffer,
  toDraft,
} from './coupons.models';

type Filter = 'all' | CouponState;

/** Catalog & growth → Coupons: offers customers type in the cart. */
@Component({
  selector: 'z-coupons-page',
  imports: [
    FormsModule,
    NzAlertModule,
    NzButtonModule,
    NzDrawerModule,
    NzIconModule,
    NzInputModule,
    NzInputNumberModule,
    NzSegmentedModule,
    NzSelectModule,
    NzSwitchModule,
    NzTableModule,
    NzTagModule,
    PageHeader,
    PageState,
    RupeesPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './coupons-page.html',
  styles: `
    .row {
      cursor: pointer;
    }
    .row:focus-visible {
      outline: 2px solid var(--z-brand);
      outline-offset: -2px;
    }
    .code {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-weight: 800;
      letter-spacing: 0.04em;
    }
  `,
})
export class CouponsPage {
  private readonly api = inject(CouponsApi);
  private readonly confirm = inject(Confirm);
  private readonly toast = inject(NzMessageService);

  readonly coupons = this.api.watchCoupons();
  readonly areas = inject(SettingsApi).watchServiceAreas();
  readonly status = allReady(this.coupons, this.areas);
  readonly now = signal(new Date());

  readonly filter = signal<Filter>('all');
  readonly search = signal('');
  readonly draft = signal<CouponDraft | null>(null);
  readonly used = signal(0);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly submitted = signal(false);

  readonly states = COUPON_STATES;
  readonly typeOptions = [
    { label: 'Flat ₹ off', value: 'flat' },
    { label: '% off', value: 'percent' },
  ];
  readonly width = computed(() => (globalThis.innerWidth < 720 ? '100%' : 560));

  readonly withState = computed(() =>
    (this.coupons.value() ?? []).map((c) => ({ c, state: couponState(c, this.now()) })),
  );
  readonly filterOptions = computed(() => {
    const count = (s: CouponState) => this.withState().filter((x) => x.state === s).length;
    return [
      { label: `All (${this.withState().length})`, value: 'all' },
      { label: `Live (${count('live')})`, value: 'live' },
      { label: `Scheduled (${count('scheduled')})`, value: 'scheduled' },
      { label: `Ended (${count('expired') + count('used_up')})`, value: 'expired' },
      { label: `Off (${count('off')})`, value: 'off' },
    ];
  });
  readonly filtered = computed(() => {
    const f = this.filter();
    const q = this.search().trim().toLowerCase();
    return this.withState().filter(
      (x) =>
        (f === 'all' || x.state === f || (f === 'expired' && x.state === 'used_up')) &&
        (!q || x.c.code.toLowerCase().includes(q) || x.c.description.toLowerCase().includes(q)),
    );
  });
  readonly areaOptions = computed(() =>
    (this.areas.value() ?? []).map((a) => ({
      label: a.isActive ? a.name : `${a.name} (off)`,
      value: a.id,
    })),
  );
  readonly problems = computed(() => {
    const d = this.draft();
    return d ? couponProblems(d) : [];
  });
  readonly preview = computed(() => {
    const d = this.draft();
    if (!d) return '';
    return describeOffer({
      type: d.type,
      discountPaise: Math.round((d.discount ?? 0) * 100),
      percent: d.percent ?? 0,
      maxDiscountPaise: d.maxDiscount ? Math.round(d.maxDiscount * 100) : null,
    });
  });

  constructor() {
    const timer = setInterval(() => this.now.set(new Date()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  offer(c: Coupon): string {
    return describeOffer(c);
  }

  validity(c: Coupon): string {
    if (!c.startAt && !c.expiresAt) return 'No end date';
    if (c.startAt && c.expiresAt) return `${formatWhen(c.startAt)} → ${formatWhen(c.expiresAt)}`;
    return c.startAt ? `From ${formatWhen(c.startAt)}` : `Until ${formatWhen(c.expiresAt)}`;
  }

  rules(c: Coupon): string[] {
    const out: string[] = [];
    if (c.perUserLimit) out.push(`${c.perUserLimit}× per customer`);
    if (c.firstOrderOnly) out.push('First order');
    if (c.serviceAreaIds.length) {
      const names = new Map((this.areas.value() ?? []).map((a) => [a.id, a.name]));
      out.push(c.serviceAreaIds.map((id) => names.get(id) ?? 'Removed area').join(', '));
    }
    return out;
  }

  local(d: Date | null): string {
    return toLocalInput(d);
  }

  openNew(): void {
    this.error.set(null);
    this.submitted.set(false);
    this.used.set(0);
    this.draft.set(blankCoupon());
  }

  openEdit(c: Coupon): void {
    this.error.set(null);
    this.submitted.set(false);
    this.used.set(c.usedCount);
    this.draft.set(toDraft(c));
  }

  patch(p: Partial<CouponDraft>): void {
    this.draft.update((d) => (d ? { ...d, ...p } : d));
  }

  setDate(field: 'startAt' | 'expiresAt', value: string): void {
    this.patch({ [field]: fromLocalInput(value) });
  }

  async toggle(c: Coupon, isActive: boolean): Promise<void> {
    try {
      await this.api.save({ ...toDraft(c), isActive });
      this.toast.success(isActive ? `${c.code} is on` : `${c.code} is off`);
    } catch (e) {
      this.toast.error((e as Error).message);
    }
  }

  async save(): Promise<void> {
    const d = this.draft();
    if (!d) return;
    this.submitted.set(true);
    if (this.problems().length) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const { code } = await this.api.save(d);
      this.toast.success(d.isNew ? `${code} created` : `${code} saved`);
      this.draft.set(null);
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  async remove(): Promise<void> {
    const d = this.draft();
    if (!d || d.isNew) return;
    const ok = await this.confirm.ask({
      title: `Delete ${d.code}?`,
      content: 'Only coupons nobody has used can be deleted. This can’t be undone.',
      okText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    this.saving.set(true);
    try {
      await this.api.delete(d.code);
      this.toast.success(`${d.code} deleted`);
      this.draft.set(null);
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  retry(): void {
    this.coupons.retry();
    this.areas.retry();
  }
}
