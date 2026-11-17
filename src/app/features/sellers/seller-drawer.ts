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
import { collection, getDocs } from 'firebase/firestore';
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
import { NzSegmentedModule } from 'ng-zorro-antd/segmented';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSkeletonModule } from 'ng-zorro-antd/skeleton';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { AuthService } from '../../core/auth/auth.service';
import { hasRole } from '../../core/auth/roles';
import { FIRESTORE } from '../../core/firebase/firebase';
import { RupeesPipe } from '../../shared/pipes/rupees.pipe';
import { WhenPipe } from '../../shared/pipes/when.pipe';
import { shortOrderId } from '../orders/orders.models';
import { LedgerRow, SellerEvent, SellerReviewAction, SellersApi } from './sellers.api';
import {
  CHECKLIST,
  DOCS,
  FULFILMENT_LABEL,
  Listing,
  MODEL_LABEL,
  Plan,
  STATUS_META,
  Seller,
  photoDistanceM,
  previewPrice,
  reliabilityPercent,
} from './sellers.models';

interface DocView {
  key: string;
  label: string;
  url: string | null;
  note: string | null;
}

const ACTION_COPY: Record<
  SellerReviewAction,
  { title: string; ok: string; danger?: boolean; reason: boolean; placeholder?: string }
> = {
  approve: { title: 'Approve this seller?', ok: 'Approve', reason: false },
  reject: {
    title: 'Reject application',
    ok: 'Reject',
    danger: true,
    reason: true,
    placeholder: 'e.g. FSSAI licence has expired',
  },
  request_changes: {
    title: 'Ask for changes',
    ok: 'Send to seller',
    reason: true,
    placeholder: 'e.g. Shop photo must show the signboard',
  },
  suspend: {
    title: 'Suspend seller',
    ok: 'Suspend',
    danger: true,
    reason: true,
    placeholder: 'e.g. Repeated wrong items',
  },
  reinstate: { title: 'Reinstate seller?', ok: 'Reinstate', reason: false },
};

@Component({
  selector: 'z-seller-drawer',
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
    NzSegmentedModule,
    NzSelectModule,
    NzSkeletonModule,
    NzSwitchModule,
    NzTagModule,
    RupeesPipe,
    WhenPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './seller-drawer.html',
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
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
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
      height: 110px;
      object-fit: cover;
      cursor: zoom-in;
    }
  `,
})
export class SellerDrawer {
  private readonly api = inject(SellersApi);
  private readonly auth = inject(AuthService);
  private readonly db = inject(FIRESTORE);
  private readonly toast = inject(NzMessageService);

  readonly sellerId = input<string | null>(null);
  readonly areaNames = input<Map<string, string>>(new Map());
  readonly closed = output<void>();

  readonly seller = signal<Seller | null | undefined>(undefined);
  readonly docs = signal<DocView[]>([]);
  readonly events = signal<SellerEvent[]>([]);
  readonly ledger = signal<LedgerRow[]>([]);
  readonly listings = signal<Listing[]>([]);
  readonly plans = signal<Plan[]>([]);
  readonly payout = signal<Record<string, string> | null>(null);
  readonly productNames = signal(
    new Map<string, { name: string; variants: Map<string, string> }>(),
  );
  readonly checks = signal<Record<string, boolean>>({});
  readonly busy = signal(false);
  readonly dialogError = signal<string | null>(null);

  readonly action = signal<SellerReviewAction | null>(null);
  readonly reason = signal('');

  readonly editing = signal<Listing | null>(null);
  readonly addonType = signal<'fixed' | 'percent'>('fixed');
  readonly addonValue = signal<number | null>(null);
  readonly sellerPriceRupees = signal<number | null>(null);
  readonly zyppiPriceRupees = signal<number | null>(null);
  readonly listingActive = signal(true);
  readonly listingReason = signal('');

  readonly money = signal<'fee' | 'adjust' | null>(null);
  readonly moneyRupees = signal<number | null>(null);
  readonly moneyMethod = signal<'upi' | 'bank' | 'cash'>('upi');
  readonly moneyText = signal('');

  readonly planChoice = signal<string | null>(null);

  readonly meta = STATUS_META;
  readonly copy = ACTION_COPY;
  readonly modelLabel = MODEL_LABEL;
  readonly fulfilmentLabel = FULFILMENT_LABEL;
  readonly reliability = reliabilityPercent;
  readonly short = shortOrderId;
  readonly checklist = CHECKLIST;
  readonly width = computed(() => (globalThis.innerWidth < 760 ? '100%' : 760));
  readonly canReview = computed(() => hasRole(this.auth.role(), ['ops']));
  readonly canFinance = computed(() => hasRole(this.auth.role(), ['finance']));
  readonly canCatalog = computed(() => hasRole(this.auth.role(), ['catalog']));
  readonly canPrice = computed(() => hasRole(this.auth.role(), ['catalog', 'finance']));
  readonly allChecked = computed(() => this.checklist.every((c) => this.checks()[c.key]));
  readonly planName = computed(() => {
    const id = this.seller()?.subscription?.planId ?? this.seller()?.planId;
    return this.plans().find((p) => p.id === id)?.name ?? id ?? '—';
  });

  /** Customer price preview in the listing editor. */
  readonly preview = computed(() => {
    const l = this.editing();
    if (!l) return null;
    if (l.model === 'supply') {
      const price = Math.round((this.zyppiPriceRupees() ?? 0) * 100);
      const supply = Math.round((this.sellerPriceRupees() ?? 0) * 100);
      return { price, payout: supply, margin: price - supply, overMrp: price > l.mrpPaise };
    }
    const seller = l.sellerPricePaise;
    const v = this.addonValue();
    const addon = v
      ? { type: this.addonType(), value: this.addonType() === 'fixed' ? Math.round(v * 100) : v }
      : null;
    const price = previewPrice(seller, addon);
    return { price, payout: seller, margin: price - seller, overMrp: price > l.mrpPaise };
  });

  constructor() {
    let stops: (() => void)[] = [];
    const stopAll = () => {
      stops.forEach((s) => s());
      stops = [];
    };
    void this.api
      .plans()
      .then((p) => this.plans.set(p))
      .catch(() => undefined);
    void this.loadProductNames();
    effect(() => {
      const id = this.sellerId();
      stopAll();
      this.seller.set(undefined);
      this.docs.set([]);
      this.payout.set(null);
      this.checks.set({});
      if (!id) return;
      let first = true;
      stops.push(
        this.api.listenSeller(
          id,
          (s) => {
            this.seller.set(s);
            if (s && first) {
              first = false;
              void this.loadDocs(s);
              void this.api.payoutDetails(id).then((p) => this.payout.set(p));
            }
          },
          () => this.seller.set(null),
        ),
        this.api.listenEvents(id, (e) => this.events.set(e)),
        this.api.listenLedger(id, (r) => this.ledger.set(r)),
        this.api.listenListings(id, (l) => this.listings.set(l)),
      );
    });
    inject(DestroyRef).onDestroy(stopAll);
  }

  private async loadProductNames(): Promise<void> {
    try {
      const s = await getDocs(collection(this.db, 'products'));
      this.productNames.set(
        new Map(
          s.docs.map((d) => [
            d.id,
            {
              name: (d.get('name') as string) ?? d.id,
              variants: new Map(
                ((d.get('variants') as { id: string; label: string }[] | undefined) ?? []).map(
                  (v) => [v.id, v.label],
                ),
              ),
            },
          ]),
        ),
      );
    } catch {
      // Names fall back to ids.
    }
  }

  private async loadDocs(s: Seller): Promise<void> {
    const views = await Promise.all(
      DOCS.filter((d) => s.docs[d.key]).map(async (d) => {
        const c = s.docs[d.key]!;
        const url = await this.api.docUrl(c.path).catch(() => null);
        const m = d.key.startsWith('shopPhoto') ? photoDistanceM(s, c) : null;
        const note =
          m == null
            ? d.key.startsWith('shopPhoto')
              ? 'No location'
              : null
            : `${m} m from the pin`;
        return { key: d.key, label: d.label, url, note };
      }),
    );
    this.docs.set(views);
  }

  label(l: Listing): string {
    const p = this.productNames().get(l.productId);
    return `${p?.name ?? l.productId} · ${p?.variants.get(l.variantId) ?? ''}`;
  }

  toggleCheck(key: string, on: boolean): void {
    this.checks.update((c) => ({ ...c, [key]: on }));
  }

  // ---- Review -----------------------------------------------------------------

  ask(a: SellerReviewAction): void {
    this.reason.set('');
    this.dialogError.set(null);
    this.action.set(a);
  }

  async confirm(): Promise<void> {
    const s = this.seller();
    const a = this.action();
    if (!s || !a) return;
    if (ACTION_COPY[a].reason && this.reason().trim().length < 3) {
      this.dialogError.set('Write a short reason — the seller will see it.');
      return;
    }
    await this.run(async () => {
      await this.api.review(s.id, a, this.reason().trim());
      this.toast.success(`${s.shopName}: ${ACTION_COPY[a].ok}`);
      this.action.set(null);
    });
  }

  // ---- Listings ---------------------------------------------------------------

  edit(l: Listing): void {
    this.dialogError.set(null);
    this.addonType.set(l.addon?.type ?? 'fixed');
    this.addonValue.set(
      l.addon ? (l.addon.type === 'fixed' ? l.addon.value / 100 : l.addon.value) : null,
    );
    this.sellerPriceRupees.set(l.sellerPricePaise / 100);
    this.zyppiPriceRupees.set(l.zyppiPricePaise == null ? null : l.zyppiPricePaise / 100);
    this.listingActive.set(l.isActive);
    this.listingReason.set('');
    this.editing.set(l);
  }

  async saveListing(): Promise<void> {
    const l = this.editing();
    const s = this.seller();
    const p = this.preview();
    if (!l || !s || !p) return;
    if (p.overMrp) {
      this.dialogError.set('The customer price can’t be above the MRP.');
      return;
    }
    const v = this.addonValue();
    await this.run(async () => {
      const r = await this.api.saveListing({
        sellerId: s.id,
        productId: l.productId,
        variantId: l.variantId,
        areaId: l.serviceAreaId,
        isActive: this.listingActive(),
        ...(l.model === 'supply'
          ? {
              sellerPricePaise: Math.round((this.sellerPriceRupees() ?? 0) * 100),
              zyppiPricePaise: Math.round((this.zyppiPriceRupees() ?? 0) * 100),
              allowNegativeMargin: p.margin < 0,
              reason: this.listingReason().trim() || undefined,
            }
          : {
              addon: v
                ? {
                    type: this.addonType(),
                    value: this.addonType() === 'fixed' ? Math.round(v * 100) : v,
                  }
                : null,
            }),
      });
      this.toast.success(`Saved · customer pays ₹${(r.pricePaise / 100).toFixed(2)}`);
      this.editing.set(null);
    });
  }

  // ---- Money ------------------------------------------------------------------

  openMoney(kind: 'fee' | 'adjust'): void {
    this.dialogError.set(null);
    this.moneyRupees.set(kind === 'fee' ? (this.seller()?.duesPaise ?? 0) / 100 : null);
    this.moneyText.set('');
    this.moneyMethod.set('upi');
    this.money.set(kind);
  }

  async saveMoney(): Promise<void> {
    const s = this.seller();
    const kind = this.money();
    const paise = Math.round((this.moneyRupees() ?? 0) * 100);
    if (!s || !kind) return;
    if (!paise) {
      this.dialogError.set('Enter an amount.');
      return;
    }
    await this.run(async () => {
      if (kind === 'fee')
        await this.api.recordFee(s.id, paise, this.moneyMethod(), this.moneyText().trim());
      else await this.api.adjust(s.id, paise, this.moneyText().trim());
      this.toast.success(kind === 'fee' ? 'Fee recorded' : 'Adjustment saved');
      this.money.set(null);
    });
  }

  async setPlan(): Promise<void> {
    const s = this.seller();
    const planId = this.planChoice();
    if (!s || !planId) return;
    await this.run(async () => {
      const r = await this.api.setPlan(s.id, planId);
      this.toast.success(r.startsNow ? 'Plan started' : 'New plan applies from the next period');
      this.planChoice.set(null);
    });
  }

  async setTrusted(on: boolean): Promise<void> {
    const s = this.seller();
    if (!s) return;
    await this.run(async () => {
      await this.api.setTrusted(s.id, on);
      this.toast.success(
        on ? 'Their own products now go live without review' : 'Their products need review again',
      );
    });
  }

  private async run(f: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.dialogError.set(null);
    try {
      await f();
    } catch (e) {
      const msg = (e as Error).message;
      this.dialogError.set(msg);
      if (!this.action() && !this.editing() && !this.money()) this.toast.error(msg);
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

  ledgerLabel(r: LedgerRow): string {
    switch (r.type) {
      case 'order':
        return `Order #${this.short(r.orderId ?? '')}${r.status === 'held' ? ' · held' : ''}`;
      case 'reversal':
        return `Cancelled #${this.short(r.orderId ?? '')}`;
      case 'payout':
        return 'Payout';
      default:
        return r.reason ? `Adjustment · ${r.reason}` : 'Adjustment';
    }
  }
}
