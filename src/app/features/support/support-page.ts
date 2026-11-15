import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSegmentedModule } from 'ng-zorro-antd/segmented';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { AuthService } from '../../core/auth/auth.service';
import { hasRole } from '../../core/auth/roles';
import { LoadStatus, friendlyFirestoreError } from '../../core/firebase/live';
import { RupeesPipe } from '../../shared/pipes/rupees.pipe';
import { WhenPipe } from '../../shared/pipes/when.pipe';
import { Confirm } from '../../shared/ui/confirm';
import { PageHeader } from '../../shared/ui/page-header';
import { PageState } from '../../shared/ui/page-state';
import { OrdersApi } from '../orders/orders.api';
import { Order, STATUS_META, shortOrderId } from '../orders/orders.models';
import { ChatCustomer, SupportApi } from './support.api';
import { CHAT_META, Chat, ChatMessage, inboxOrder, waitedFor } from './support.models';

type View = 'open' | 'recent';

/**
 * Support inbox: chats waiting for a person first (longest wait on top),
 * the thread with reply and close, and the order the chat is about.
 */
@Component({
  selector: 'z-support-page',
  imports: [
    FormsModule,
    NzBadgeModule,
    NzButtonModule,
    NzIconModule,
    NzInputModule,
    NzSegmentedModule,
    NzTagModule,
    PageHeader,
    PageState,
    RouterLink,
    RupeesPipe,
    WhenPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './support-page.html',
  styleUrl: './support-page.scss',
})
export class SupportPage {
  private readonly api = inject(SupportApi);
  private readonly orders = inject(OrdersApi);
  private readonly router = inject(Router);
  private readonly message = inject(NzMessageService);
  private readonly confirm = inject(Confirm);
  private readonly auth = inject(AuthService);

  /** Route param :id (the chat). */
  readonly id = input<string | undefined>();

  readonly openChats = this.api.watchOpen();
  readonly recentChats = this.api.watchRecent();
  readonly view = signal<View>('open');
  readonly chatMeta = CHAT_META;
  readonly orderMeta = STATUS_META;
  readonly shortId = shortOrderId;
  readonly waited = waitedFor;
  readonly canCustomers = computed(() => hasRole(this.auth.role(), ['ops', 'support']));
  readonly canOrders = computed(() => hasRole(this.auth.role(), ['ops', 'support']));

  readonly waitingCount = computed(
    () => (this.openChats.value() ?? []).filter((c) => c.status === 'waiting_agent').length,
  );
  readonly viewOptions = computed(() => [
    { label: `Open (${(this.openChats.value() ?? []).length})`, value: 'open' },
    { label: 'Recent', value: 'recent' },
  ]);

  readonly list = computed(() => {
    const live = this.view() === 'open' ? this.openChats : this.recentChats;
    return [...(live.value() ?? [])].sort(inboxOrder);
  });
  readonly listStatus = computed<LoadStatus>(() =>
    (this.view() === 'open' ? this.openChats : this.recentChats).status(),
  );
  readonly listError = computed(() =>
    (this.view() === 'open' ? this.openChats : this.recentChats).error(),
  );

  // The open thread.
  readonly chat = signal<Chat | null>(null);
  readonly messages = signal<ChatMessage[]>([]);
  readonly threadStatus = signal<LoadStatus>('loading');
  readonly threadError = signal<string | null>(null);
  readonly customer = signal<ChatCustomer | null>(null);
  readonly order = signal<Order | null>(null);
  readonly draft = signal('');
  readonly sending = signal(false);
  readonly closing = signal(false);

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private stops: (() => void)[] = [];

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.open(id ?? null));
    });
    // Keep the newest message in view, and clear unread while the chat is open.
    effect(() => {
      this.messages();
      const el = this.scroller()?.nativeElement;
      if (el) queueMicrotask(() => (el.scrollTop = el.scrollHeight));
    });
    effect(() => {
      const c = this.chat();
      if (c && c.unreadByAgent > 0) void this.api.markRead(c.id).catch(() => undefined);
    });
    inject(DestroyRef).onDestroy(() => this.stopAll());
  }

  private stopAll(): void {
    for (const s of this.stops) s();
    this.stops = [];
  }

  private open(id: string | null): void {
    this.stopAll();
    this.chat.set(null);
    this.messages.set([]);
    this.customer.set(null);
    this.order.set(null);
    this.draft.set('');
    if (!id) return;
    this.threadStatus.set('loading');
    this.threadError.set(null);
    const fail = (e: Error) => {
      this.threadError.set(friendlyFirestoreError(e));
      this.threadStatus.set('error');
    };
    let orderWatched = false;
    this.stops.push(
      this.api.listenChat(
        id,
        (c) => {
          this.chat.set(c);
          if (!c) {
            this.threadError.set('This chat doesn’t exist any more.');
            this.threadStatus.set('error');
            return;
          }
          if (!this.customer()) {
            void this.api
              .customer(c.userId)
              .then((x) => this.customer.set(x))
              .catch(() => this.customer.set({ name: 'Customer', phone: null }));
          }
          if (c.orderId && !orderWatched) {
            orderWatched = true;
            this.stops.push(
              this.orders.listenOrder(
                c.orderId,
                (o) => this.order.set(o),
                () => this.order.set(null),
              ),
            );
          }
        },
        fail,
      ),
      this.api.listenMessages(
        id,
        (m) => {
          this.messages.set(m);
          this.threadStatus.set('ready');
        },
        fail,
      ),
    );
  }

  retryThread(): void {
    this.open(this.id() ?? null);
  }

  select(c: Chat): void {
    void this.router.navigate(['/support', c.id]);
  }

  back(): void {
    void this.router.navigate(['/support']);
  }

  async send(): Promise<void> {
    const c = this.chat();
    const text = this.draft().trim();
    if (!c || !text || this.sending()) return;
    this.sending.set(true);
    try {
      await this.api.reply(c.id, text);
      this.draft.set('');
    } catch (e) {
      this.message.error((e as Error).message);
    } finally {
      this.sending.set(false);
    }
  }

  onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void this.send();
    }
  }

  async close(): Promise<void> {
    const c = this.chat();
    if (!c) return;
    const ok = await this.confirm.ask({
      title: 'Close this chat?',
      content: 'The customer can start again from the app; the bot will greet them.',
      okText: 'Close chat',
    });
    if (!ok) return;
    this.closing.set(true);
    try {
      await this.api.close(c.id);
      this.message.success('Chat closed');
    } catch (e) {
      this.message.error((e as Error).message);
    } finally {
      this.closing.set(false);
    }
  }

  sender(m: ChatMessage): string {
    return m.from === 'user'
      ? (this.customer()?.name ?? 'Customer')
      : m.from === 'agent'
        ? 'Team'
        : 'Bot';
  }
}
