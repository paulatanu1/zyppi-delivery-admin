import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzSegmentedModule } from 'ng-zorro-antd/segmented';
import { NzTableModule } from 'ng-zorro-antd/table';
import { RupeesPipe } from '../../shared/pipes/rupees.pipe';
import { WhenPipe } from '../../shared/pipes/when.pipe';
import { PageHeader } from '../../shared/ui/page-header';
import { PageState } from '../../shared/ui/page-state';
import { SellerPayoutRequest, SellersApi } from '../sellers/sellers.api';

/** Finance: sellers' payout requests → pay by bank / UPI, record the UTR. */
@Component({
  selector: 'z-seller-payouts-page',
  imports: [
    FormsModule,
    NzAlertModule,
    NzButtonModule,
    NzInputModule,
    NzModalModule,
    NzSegmentedModule,
    NzTableModule,
    RupeesPipe,
    WhenPipe,
    PageHeader,
    PageState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <z-page-header
      title="Seller payouts"
      subtitle="Pay each request by bank transfer or UPI, then record the UTR. Plan fees due were already taken off."
    />
    <z-page-state
      [status]="requests.status()"
      [error]="requests.error()"
      [empty]="(requests.value() ?? []).length === 0"
      emptyTitle="No payout requests"
      emptyText="Sellers request payouts from the Zyppi Seller app."
      (retry)="requests.retry()"
    >
      <div class="z-card overflow-hidden">
        <nz-table
          #t
          [nzData]="requests.value() ?? []"
          [nzPageSize]="25"
          [nzScroll]="{ x: '700px' }"
        >
          <thead>
            <tr>
              <th>Seller</th>
              <th>Requested</th>
              <th>Fees deducted</th>
              <th>To pay</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (r of t.data; track r.id) {
              <tr>
                <td class="font-bold">{{ names().get(r.sellerId) ?? r.sellerId }}</td>
                <td class="z-caption">{{ r.requestedAt | when }}</td>
                <td>{{ r.duesDeductedPaise | rupees }}</td>
                <td class="font-bold">{{ r.payablePaise | rupees }}</td>
                <td>
                  <button nz-button nzType="primary" nzSize="small" (click)="open(r)">
                    Record payment
                  </button>
                </td>
              </tr>
            }
          </tbody>
        </nz-table>
      </div>
    </z-page-state>

    <nz-modal
      [nzVisible]="!!paying()"
      nzTitle="Record payout"
      [nzCentered]="true"
      nzOkText="Record"
      [nzOkLoading]="busy()"
      (nzOnOk)="record()"
      (nzOnCancel)="paying.set(null)"
    >
      <ng-container *nzModalContent>
        @if (paying(); as r) {
          <div class="flex flex-col gap-3">
            <p class="m-0">
              Pay <b>{{ r.payablePaise | rupees }}</b> to
              {{ names().get(r.sellerId) ?? 'the seller' }}
              @if (r.duesDeductedPaise) {
                <span class="z-muted">({{ r.duesDeductedPaise | rupees }} plan fees are kept)</span>
              }
            </p>
            <nz-segmented
              [nzOptions]="[
                { label: 'UPI', value: 'upi' },
                { label: 'Bank', value: 'bank' },
              ]"
              [ngModel]="method()"
              (ngModelChange)="method.set($event)"
            />
            <input
              nz-input
              maxlength="60"
              placeholder="UTR / reference"
              aria-label="UTR"
              [ngModel]="reference()"
              (ngModelChange)="reference.set($event)"
            />
            @if (error(); as e) {
              <nz-alert nzType="error" nzShowIcon [nzMessage]="e" />
            }
          </div>
        }
      </ng-container>
    </nz-modal>
  `,
})
export class SellerPayoutsPage {
  private readonly api = inject(SellersApi);
  private readonly toast = inject(NzMessageService);
  private readonly sellers = this.api.watchAll();

  readonly requests = this.api.watchPayoutRequests();
  readonly names = computed(
    () => new Map((this.sellers.value() ?? []).map((s) => [s.id, s.shopName])),
  );
  readonly paying = signal<SellerPayoutRequest | null>(null);
  readonly method = signal<'upi' | 'bank'>('upi');
  readonly reference = signal('');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  open(r: SellerPayoutRequest): void {
    this.reference.set('');
    this.error.set(null);
    this.paying.set(r);
  }

  async record(): Promise<void> {
    const r = this.paying();
    if (!r) return;
    if (this.reference().trim().length < 4) {
      this.error.set('Enter the UTR / reference of the transfer.');
      return;
    }
    this.busy.set(true);
    try {
      await this.api.recordPayout({
        sellerId: r.sellerId,
        payoutId: r.id,
        amountPaise: r.payablePaise,
        duesDeductedPaise: r.duesDeductedPaise,
        method: this.method(),
        reference: this.reference().trim(),
      });
      this.toast.success('Payout recorded');
      this.paying.set(null);
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
