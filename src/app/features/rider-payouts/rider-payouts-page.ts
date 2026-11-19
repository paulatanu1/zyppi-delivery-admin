import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzSegmentedModule } from 'ng-zorro-antd/segmented';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { RupeesPipe } from '../../shared/pipes/rupees.pipe';
import { WhenPipe } from '../../shared/pipes/when.pipe';
import { PageHeader } from '../../shared/ui/page-header';
import { PageState } from '../../shared/ui/page-state';
import { PayoutRequest, RiderBalance, RiderPayoutsApi, payable } from './rider-payouts.api';

interface PayDraft {
  riderId: string;
  riderName: string;
  payoutId?: string;
  maxPaise: number;
  rupees: number | null;
  method: 'upi' | 'bank' | 'cash';
  reference: string;
  /** One per dialog: a retried or double-clicked confirm records one payout. */
  requestId: string;
}

/**
 * Rider payouts (finance): requests from the Pocket tab, every rider's
 * balance, recording money sent (UPI / bank / cash with its reference),
 * and manual adjustments. Money moves outside the app; this is the record.
 */
@Component({
  selector: 'z-rider-payouts-page',
  imports: [
    FormsModule,
    NzButtonModule,
    NzFormModule,
    NzInputModule,
    NzInputNumberModule,
    NzModalModule,
    NzSegmentedModule,
    NzTableModule,
    NzTabsModule,
    PageHeader,
    PageState,
    RupeesPipe,
    WhenPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rider-payouts-page.html',
})
export class RiderPayoutsPage {
  private readonly api = inject(RiderPayoutsApi);
  private readonly message = inject(NzMessageService);

  readonly requests = this.api.watchRequests();
  readonly balances = this.api.watchBalances();
  readonly payable = payable;
  readonly methods = [
    { label: 'UPI', value: 'upi' },
    { label: 'Bank', value: 'bank' },
    { label: 'Cash', value: 'cash' },
  ];
  readonly owed = computed(() =>
    (this.balances.value() ?? []).reduce(
      (s, r) => s + payable(r.earningsBalancePaise, r.codBalancePaise),
      0,
    ),
  );

  readonly pay = signal<PayDraft | null>(null);
  readonly adjusting = signal<RiderBalance | null>(null);
  readonly adjustRupees = signal<number | null>(null);
  readonly adjustReason = signal('');
  readonly busy = signal(false);

  payRequest(r: PayoutRequest): void {
    const bal = (this.balances.value() ?? []).find((b) => b.id === r.riderId);
    this.pay.set({
      riderId: r.riderId,
      riderName: r.riderName,
      payoutId: r.id,
      maxPaise: bal?.earningsBalancePaise ?? r.amountPaise,
      rupees: r.amountPaise / 100,
      method: 'upi',
      reference: '',
      requestId: crypto.randomUUID(),
    });
  }

  payRider(b: RiderBalance): void {
    this.pay.set({
      riderId: b.id,
      riderName: b.name,
      maxPaise: b.earningsBalancePaise,
      rupees: payable(b.earningsBalancePaise, b.codBalancePaise) / 100,
      method: 'upi',
      reference: '',
      requestId: crypto.randomUUID(),
    });
  }

  patchPay(f: (d: PayDraft) => void): void {
    const d = this.pay();
    if (!d) return;
    const next = { ...d };
    f(next);
    this.pay.set(next);
  }

  async confirmPay(): Promise<void> {
    const d = this.pay();
    if (!d) return;
    this.busy.set(true);
    try {
      await this.api.recordPayout({
        riderId: d.riderId,
        amountPaise: Math.round((d.rupees ?? 0) * 100),
        method: d.method,
        reference: d.reference,
        payoutId: d.payoutId,
        requestId: d.requestId,
      });
      this.message.success(`Payout to ${d.riderName} recorded`);
      this.pay.set(null);
    } catch (e) {
      this.message.error((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  openAdjust(b: RiderBalance): void {
    this.adjustRupees.set(null);
    this.adjustReason.set('');
    this.adjusting.set(b);
  }

  async confirmAdjust(): Promise<void> {
    const b = this.adjusting();
    if (!b) return;
    this.busy.set(true);
    try {
      await this.api.adjust(
        b.id,
        Math.round((this.adjustRupees() ?? 0) * 100),
        this.adjustReason(),
      );
      this.message.success('Adjustment saved');
      this.adjusting.set(null);
    } catch (e) {
      this.message.error((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
