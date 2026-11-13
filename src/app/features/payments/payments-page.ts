import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { RupeesPipe } from '../../shared/pipes/rupees.pipe';
import { WhenPipe } from '../../shared/pipes/when.pipe';
import { Confirm } from '../../shared/ui/confirm';
import { PageHeader } from '../../shared/ui/page-header';
import { PageState } from '../../shared/ui/page-state';
import { REFUND_META } from '../orders/orders.api';
import { shortOrderId } from '../orders/orders.models';
import { INTENT_META, Intent, IntentStatus, PaymentsApi, RefundRow } from './payments.api';

@Component({
  selector: 'z-payments-page',
  imports: [
    FormsModule,
    RouterLink,
    NzAlertModule,
    NzBadgeModule,
    NzButtonModule,
    NzIconModule,
    NzInputModule,
    NzModalModule,
    NzSelectModule,
    NzTableModule,
    NzTabsModule,
    NzTagModule,
    RupeesPipe,
    WhenPipe,
    PageHeader,
    PageState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './payments-page.html',
})
export class PaymentsPage {
  private readonly api = inject(PaymentsApi);
  private readonly confirm = inject(Confirm);
  private readonly toast = inject(NzMessageService);

  readonly review = this.api.watchNeedsReview();
  readonly refunds = this.api.watchRefunds();
  readonly intents = this.api.watchIntents();

  readonly tab = signal(0);
  readonly statusFilter = signal<IntentStatus | null>(null);
  readonly busy = signal<string | null>(null);
  readonly dismissing = signal<Intent | null>(null);
  readonly note = signal('');
  readonly dismissError = signal<string | null>(null);

  readonly intentMeta = INTENT_META;
  readonly refundMeta = REFUND_META;
  readonly short = shortOrderId;
  readonly statusOptions = (Object.keys(INTENT_META) as IntentStatus[]).map((s) => ({
    label: INTENT_META[s].label,
    value: s,
  }));

  readonly visibleIntents = computed(() => {
    const f = this.statusFilter();
    return (this.intents.value() ?? []).filter((i) => !f || i.status === f);
  });

  readonly kpis = computed(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const t = today.getTime();
    const intents = this.intents.value() ?? [];
    const paidToday = intents.filter(
      (i) => i.status === 'completed' && (i.createdAt?.toMillis() ?? 0) >= t,
    );
    const refunds = this.refunds.value() ?? [];
    return {
      paidToday: paidToday.reduce((s, i) => s + i.amountPaise, 0),
      paidTodayCount: paidToday.length,
      review: this.review.value()?.length ?? 0,
      openRefunds: refunds.filter((r) => r.status === 'requesting' || r.status === 'requested')
        .length,
      failedRate: (() => {
        const done = intents.filter((i) => ['completed', 'failed', 'expired'].includes(i.status));
        return done.length
          ? Math.round((done.filter((i) => i.status !== 'completed').length / done.length) * 100)
          : 0;
      })(),
    };
  });

  async refund(i: Intent): Promise<void> {
    const left = i.amountPaise - i.refundedPaise;
    const ok = await this.confirm.ask({
      title: `Refund ₹${(left / 100).toFixed(2)}?`,
      content:
        'The customer paid but no order was created. The full amount goes back through PayU (usually 5–7 working days).',
      okText: 'Refund',
    });
    if (!ok) return;
    await this.run(i.id, async () => {
      const res = await this.api.resolve(i.id, 'refund', '');
      this.toast.success(
        `Refund ${REFUND_META[res.status as keyof typeof REFUND_META]?.label.toLowerCase() ?? res.status}`,
      );
    });
  }

  openDismiss(i: Intent): void {
    this.note.set('');
    this.dismissError.set(null);
    this.dismissing.set(i);
  }

  async dismiss(): Promise<void> {
    const i = this.dismissing();
    if (!i) return;
    if (this.note().trim().length < 3) {
      this.dismissError.set('Say how it was handled, e.g. “Refunded from PayU dashboard”.');
      return;
    }
    await this.run(i.id, async () => {
      await this.api.resolve(i.id, 'dismiss', this.note().trim());
      this.dismissing.set(null);
      this.toast.success('Marked as resolved');
    });
  }

  async refresh(r: RefundRow): Promise<void> {
    await this.run(r.id, async () => {
      const res = await this.api.refreshRefund(r.id);
      this.toast.info(
        `Refund: ${REFUND_META[res.status as keyof typeof REFUND_META]?.label ?? res.status}`,
      );
    });
  }

  private async run(key: string, task: () => Promise<void>): Promise<void> {
    this.busy.set(key);
    try {
      await task();
    } catch (e) {
      const msg = (e as Error).message;
      if (this.dismissing()) this.dismissError.set(msg);
      else this.toast.error(msg);
    } finally {
      this.busy.set(null);
    }
  }
}
