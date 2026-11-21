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
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { AuthService } from '../../core/auth/auth.service';
import { hasRole } from '../../core/auth/roles';
import { LoadStatus, friendlyFirestoreError } from '../../core/firebase/live';
import { RupeesPipe } from '../../shared/pipes/rupees.pipe';
import { WhenPipe } from '../../shared/pipes/when.pipe';
import { PageState } from '../../shared/ui/page-state';
import { Order, STATUS_META } from '../orders/orders.models';
import { INTENT_META, Intent } from '../payments/payments.api';
import { RETURN_META, ReturnDoc } from '../returns/returns.models';
import { CHAT_META, Chat } from '../support/support.models';
import { CustomersApi, ProductName } from './customers.api';
import {
  CartLine,
  Consent,
  Customer,
  CustomerAddress,
  CustomerAuth,
  Favourite,
  InboxEntry,
  MAX_WALLET_CREDIT_PAISE,
  SellerRating,
  WALLET_TYPE_LABEL,
  WalletEntry,
  averageOrder,
  couponsUsed,
  customerName,
  maskToken,
} from './customers.models';
import {
  Claim,
  KIND_LABEL,
  STATUS_META as CLAIM_META,
  claimAmountPaise,
} from '../claims/claims.models';

const PROVIDERS: Record<string, string> = {
  phone: 'Phone OTP',
  'google.com': 'Google',
  password: 'Email',
};

/** One customer: profile, value, orders, addresses, chats; block and notify. */
@Component({
  selector: 'z-customer-drawer',
  imports: [
    FormsModule,
    NzButtonModule,
    NzDrawerModule,
    NzFormModule,
    NzIconModule,
    NzInputModule,
    NzModalModule,
    NzTabsModule,
    NzTagModule,
    PageState,
    RouterLink,
    RupeesPipe,
    WhenPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './customer-drawer.html',
})
export class CustomerDrawer {
  private readonly api = inject(CustomersApi);
  private readonly message = inject(NzMessageService);
  private readonly auth = inject(AuthService);

  readonly id = input<string | null>(null);
  readonly closed = output<void>();

  readonly orderMeta = STATUS_META;
  readonly chatMeta = CHAT_META;
  readonly claimMeta = CLAIM_META;
  readonly claimKind = KIND_LABEL;
  readonly returnMeta = RETURN_META;
  readonly intentMeta = INTENT_META;
  readonly mask = maskToken;
  readonly aov = averageOrder;
  readonly canBlock = computed(() => hasRole(this.auth.role(), ['ops']));
  readonly canOrders = computed(() => hasRole(this.auth.role(), ['ops', 'support']));
  readonly canSupport = computed(() => hasRole(this.auth.role(), ['support']));
  /** orderIssues and returns: ops, support, finance (firestore.rules). */
  readonly canCases = computed(() => hasRole(this.auth.role(), ['ops', 'support', 'finance']));
  /** adminCreditWallet is finance only. */
  readonly canCredit = computed(() => hasRole(this.auth.role(), ['finance']));
  readonly walletLabel = WALLET_TYPE_LABEL;
  readonly abs = Math.abs;
  readonly wallet = signal<WalletEntry[] | null>(null);

  // Wallet credit dialog.
  readonly creditOpen = signal(false);
  readonly creditAmount = signal('');
  readonly creditReason = signal('');
  readonly creditMax = MAX_WALLET_CREDIT_PAISE;
  readonly creditPaise = computed(() =>
    claimAmountPaise(this.creditAmount(), MAX_WALLET_CREDIT_PAISE),
  );
  private creditRequestId = '';

  readonly customer = signal<Customer | null>(null);
  readonly status = signal<LoadStatus>('loading');
  readonly error = signal<string | null>(null);
  readonly orders = signal<Order[] | null>(null);
  readonly addresses = signal<CustomerAddress[] | null>(null);
  readonly chats = signal<Chat[] | null>(null);
  readonly account = signal<CustomerAuth | null>(null);
  readonly ratings = signal<SellerRating[]>([]);
  readonly cart = signal<CartLine[] | null>(null);
  readonly favourites = signal<Favourite[] | null>(null);
  readonly inbox = signal<InboxEntry[] | null>(null);
  readonly consents = signal<Consent[] | null>(null);
  readonly claims = signal<Claim[] | null>(null);
  readonly returns = signal<ReturnDoc[] | null>(null);
  readonly payments = signal<Intent[] | null>(null);
  readonly products = signal<Map<string, ProductName>>(new Map());
  readonly areaName = signal<string | null>(null);
  readonly sideError = signal<string | null>(null);

  readonly coupons = computed(() => couponsUsed(this.orders() ?? []));
  /** The app version / platform from the newest consent (sent by the app). */
  readonly device = computed(
    () => this.consents()?.find((c) => c.appVersion || c.platform) ?? null,
  );

  readonly title = computed(() => {
    const c = this.customer();
    return c ? customerName(c) : 'Customer';
  });
  readonly providers = computed(() =>
    (this.account()?.providers ?? []).map((p) => PROVIDERS[p] ?? p).join(', '),
  );

  // Block / notify dialogs.
  readonly blockOpen = signal(false);
  readonly blockReason = signal('');
  readonly pushOpen = signal(false);
  readonly pushTitle = signal('');
  readonly pushBody = signal('');
  readonly busy = signal(false);

  private stop: (() => void) | null = null;

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
    inject(DestroyRef).onDestroy(() => this.stop?.());
  }

  private load(id: string | null): void {
    this.stop?.();
    this.stop = null;
    this.customer.set(null);
    this.orders.set(null);
    this.addresses.set(null);
    this.chats.set(null);
    this.account.set(null);
    this.wallet.set(null);
    this.ratings.set([]);
    this.cart.set(null);
    this.favourites.set(null);
    this.inbox.set(null);
    this.consents.set(null);
    this.claims.set(null);
    this.returns.set(null);
    this.payments.set(null);
    this.products.set(new Map());
    this.areaName.set(null);
    this.sideError.set(null);
    if (!id) return;
    this.status.set('loading');
    this.error.set(null);
    this.stop = this.api.listen(
      id,
      (c) => {
        this.customer.set(c);
        if (!c) {
          this.error.set('No profile for this customer (they may have deleted their account).');
          this.status.set('error');
        } else {
          this.status.set('ready');
        }
      },
      (e) => {
        this.error.set(friendlyFirestoreError(e));
        this.status.set('error');
      },
    );
    void this.loadSide(id);
  }

  async loadSide(id: string): Promise<void> {
    this.sideError.set(null);
    const results = await Promise.allSettled([
      this.api.orders(id),
      this.api.addresses(id),
      this.canSupport() ? this.api.chats(id) : Promise.resolve([]),
      this.api.auth(id),
      this.api.wallet(id),
      this.api.cart(id),
      this.api.favourites(id),
      this.api.inbox(id),
      this.api.consents(id),
      this.canCases() ? this.api.claims(id) : Promise.resolve([]),
      this.canCases() ? this.api.returns(id) : Promise.resolve([]),
      this.api.payments(id),
    ] as const);
    if (this.id() !== id) return;
    const [
      orders,
      addresses,
      chats,
      account,
      wallet,
      cart,
      favourites,
      inbox,
      consents,
      claims,
      returns,
      payments,
    ] = results;
    const value = <T>(r: PromiseSettledResult<T>, fallback: T): T =>
      r.status === 'fulfilled' ? r.value : fallback;
    const o = value(orders, { orders: [], ratings: [] });
    this.orders.set(o.orders);
    this.ratings.set(o.ratings);
    this.addresses.set(value(addresses, []));
    this.chats.set(value(chats, []));
    this.account.set(value(account, null));
    this.wallet.set(value(wallet, []));
    this.cart.set(value(cart, []));
    this.favourites.set(value(favourites, []));
    this.inbox.set(value(inbox, []));
    this.consents.set(value(consents, []));
    this.claims.set(value(claims, []));
    this.returns.set(value(returns, []));
    this.payments.set(value(payments, []));
    if (results.some((r) => r.status === 'rejected')) {
      this.sideError.set('Some details couldn’t be loaded.');
    }
    void this.loadNames(id);
  }

  /** Product names for the cart and favourites, and the service area's name. */
  private async loadNames(id: string): Promise<void> {
    const ids = [
      ...(this.cart() ?? []).map((l) => l.productId),
      ...(this.favourites() ?? []).map((f) => f.productId),
    ];
    const areaId = this.customer()?.serviceAreaId ?? null;
    const [names, area] = await Promise.allSettled([
      ids.length ? this.api.productNames(ids) : Promise.resolve(new Map<string, ProductName>()),
      areaId ? this.api.areaName(areaId) : Promise.resolve(null),
    ]);
    if (this.id() !== id) return;
    if (names.status === 'fulfilled') this.products.set(names.value);
    if (area.status === 'fulfilled') this.areaName.set(area.value);
  }

  /** "Missing, Damaged" for a claim's lines. */
  claimKinds(c: Claim): string {
    return [...new Set(c.lines.map((l) => this.claimKind[l.kind] ?? l.kind))].join(', ');
  }

  productLabel(productId: string, variantId?: string): string {
    const p = this.products().get(productId);
    if (!p) return productId;
    const v = variantId ? p.variants[variantId] : '';
    return v ? `${p.name} · ${v}` : p.name;
  }

  async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.message.success('Copied');
    } catch {
      this.message.error('Couldn’t copy');
    }
  }

  retry(): void {
    this.load(this.id());
  }

  mapLink(a: CustomerAddress): string | null {
    return a.lat != null && a.lng != null
      ? `https://www.google.com/maps/search/?api=1&query=${a.lat},${a.lng}`
      : null;
  }

  async toggleBlock(): Promise<void> {
    const c = this.customer();
    if (!c) return;
    if (!c.blocked) {
      this.blockReason.set('');
      this.blockOpen.set(true);
      return;
    }
    await this.setBlocked(false, '');
  }

  async setBlocked(blocked: boolean, reason: string): Promise<void> {
    const c = this.customer();
    if (!c) return;
    this.busy.set(true);
    try {
      await this.api.setBlocked(c.id, blocked, reason);
      this.message.success(blocked ? 'Customer blocked from ordering' : 'Customer unblocked');
      this.blockOpen.set(false);
    } catch (e) {
      this.message.error((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  openCredit(): void {
    this.creditAmount.set('');
    this.creditReason.set('');
    // One id per dialog: a retry or double click can't credit twice.
    this.creditRequestId = crypto.randomUUID();
    this.creditOpen.set(true);
  }

  async credit(): Promise<void> {
    const c = this.customer();
    const paise = this.creditPaise();
    if (!c || paise == null) return;
    this.busy.set(true);
    try {
      await this.api.creditWallet(c.id, paise, this.creditReason().trim(), this.creditRequestId);
      this.message.success('Wallet credited; the customer can spend it right away');
      this.creditOpen.set(false);
      this.wallet.set(await this.api.wallet(c.id));
    } catch (e) {
      this.message.error((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  openPush(): void {
    this.pushTitle.set('');
    this.pushBody.set('');
    this.pushOpen.set(true);
  }

  async sendPush(): Promise<void> {
    const c = this.customer();
    if (!c) return;
    this.busy.set(true);
    try {
      await this.api.push(c.id, this.pushTitle(), this.pushBody());
      this.message.success('Notification sent');
      this.pushOpen.set(false);
    } catch (e) {
      this.message.error((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
