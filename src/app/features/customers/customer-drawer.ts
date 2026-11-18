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
import { CHAT_META, Chat } from '../support/support.models';
import { CustomersApi } from './customers.api';
import {
  Customer,
  CustomerAddress,
  CustomerAuth,
  MAX_WALLET_CREDIT_PAISE,
  WALLET_TYPE_LABEL,
  WalletEntry,
  averageOrder,
  customerName,
} from './customers.models';
import { claimAmountPaise } from '../claims/claims.models';

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
  readonly aov = averageOrder;
  readonly canBlock = computed(() => hasRole(this.auth.role(), ['ops']));
  readonly canOrders = computed(() => hasRole(this.auth.role(), ['ops', 'support']));
  readonly canSupport = computed(() => hasRole(this.auth.role(), ['support']));
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
  readonly sideError = signal<string | null>(null);

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
    const [orders, addresses, chats, account, wallet] = await Promise.allSettled([
      this.api.orders(id),
      this.api.addresses(id),
      this.canSupport() ? this.api.chats(id) : Promise.resolve([]),
      this.api.auth(id),
      this.api.wallet(id),
    ]);
    if (this.id() !== id) return;
    this.orders.set(orders.status === 'fulfilled' ? orders.value : []);
    this.addresses.set(addresses.status === 'fulfilled' ? addresses.value : []);
    this.chats.set(chats.status === 'fulfilled' ? chats.value : []);
    this.account.set(account.status === 'fulfilled' ? account.value : null);
    this.wallet.set(wallet.status === 'fulfilled' ? wallet.value : []);
    const failed = [orders, addresses, chats, account, wallet].find((r) => r.status === 'rejected');
    if (failed) this.sideError.set('Some details couldn’t be loaded.');
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
