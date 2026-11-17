import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTableModule } from 'ng-zorro-antd/table';
import { Callables } from '../../core/firebase/callable';
import { LoadStatus } from '../../core/firebase/live';
import { RupeesPipe } from '../../shared/pipes/rupees.pipe';
import { PageHeader } from '../../shared/ui/page-header';
import { PageState } from '../../shared/ui/page-state';

export interface TaxRow {
  sellerId: string;
  shopName: string;
  ownerName: string;
  gstin: string;
  pan: string;
  orders: number;
  salesPaise: number;
  tcsPaise: number;
  tdsPaise: number;
}

interface TaxReport {
  month: string;
  rows: TaxRow[];
  totals: { salesPaise: number; tcsPaise: number; tdsPaise: number };
  csv: string;
}

/** "YYYY-MM" for a picked date (India month). */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Finance → Seller tax: per seller net sales, TCS collected (GST §52,
 * GSTR-8) and TDS deducted (Income-tax §194-O) for a month, from the
 * seller ledger, with a CSV for the CA.
 */
@Component({
  selector: 'z-seller-tax-page',
  imports: [
    FormsModule,
    NzAlertModule,
    NzButtonModule,
    NzDatePickerModule,
    NzIconModule,
    NzTableModule,
    RupeesPipe,
    PageHeader,
    PageState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <z-page-header
      title="Seller tax (TCS / TDS)"
      subtitle="What Zyppi collected and deducted on marketplace sellers’ sales. Rates come from config/marketplace.settlement, so ask your CA to confirm them before you file."
    />
    <div class="flex flex-wrap items-center gap-3 mb-4">
      <nz-date-picker
        nzMode="month"
        [nzAllowClear]="false"
        aria-label="Month"
        [ngModel]="picked()"
        (ngModelChange)="pick($event)"
      />
      <span class="flex-1"></span>
      <button nz-button [disabled]="!report()?.rows?.length" (click)="download()">
        <span nz-icon nzType="download"></span>Download CSV
      </button>
    </div>
    <z-page-state
      [status]="status()"
      [error]="error()"
      [empty]="(report()?.rows ?? []).length === 0"
      emptyTitle="No marketplace sales this month"
      emptyText="Sellers’ delivered orders, returns and cancellations show here."
      (retry)="load()"
    >
      @if (report(); as r) {
        <div class="grid gap-3 sm:grid-cols-3 mb-4">
          <div class="z-card p-4">
            <div class="z-caption">Net sales</div>
            <div class="text-xl font-extrabold">{{ r.totals.salesPaise | rupees }}</div>
          </div>
          <div class="z-card p-4">
            <div class="z-caption">TCS collected</div>
            <div class="text-xl font-extrabold">{{ r.totals.tcsPaise | rupees }}</div>
          </div>
          <div class="z-card p-4">
            <div class="z-caption">TDS deducted</div>
            <div class="text-xl font-extrabold">{{ r.totals.tdsPaise | rupees }}</div>
          </div>
        </div>
        <div class="z-card overflow-hidden">
          <nz-table #t [nzData]="r.rows" [nzPageSize]="50" [nzScroll]="{ x: '820px' }">
            <thead>
              <tr>
                <th>Seller</th>
                <th>GSTIN</th>
                <th>PAN</th>
                <th nzAlign="right">Orders</th>
                <th nzAlign="right">Net sales</th>
                <th nzAlign="right">TCS</th>
                <th nzAlign="right">TDS</th>
              </tr>
            </thead>
            <tbody>
              @for (row of t.data; track row.sellerId) {
                <tr>
                  <td>
                    <div class="font-bold">{{ row.shopName }}</div>
                    <div class="z-caption">{{ row.ownerName }}</div>
                  </td>
                  <td>{{ row.gstin || '—' }}</td>
                  <td>{{ row.pan || '—' }}</td>
                  <td nzAlign="right">{{ row.orders }}</td>
                  <td nzAlign="right">{{ row.salesPaise | rupees }}</td>
                  <td nzAlign="right">{{ row.tcsPaise | rupees }}</td>
                  <td nzAlign="right">{{ row.tdsPaise | rupees }}</td>
                </tr>
              }
            </tbody>
          </nz-table>
        </div>
      }
    </z-page-state>
  `,
})
export class SellerTaxPage {
  private readonly callables = inject(Callables);

  readonly picked = signal<Date>(new Date());
  readonly status = signal<LoadStatus>('loading');
  readonly error = signal<string | null>(null);
  readonly report = signal<TaxReport | null>(null);

  constructor() {
    void this.load();
  }

  pick(d: Date | null): void {
    if (!d) return;
    this.picked.set(d);
    void this.load();
  }

  async load(): Promise<void> {
    this.status.set('loading');
    try {
      this.report.set(
        await this.callables.call<{ month: string }, TaxReport>('adminSellerTaxReport', {
          month: monthKey(this.picked()),
        }),
      );
      this.status.set('ready');
    } catch (e) {
      this.error.set((e as Error).message);
      this.status.set('error');
    }
  }

  download(): void {
    const r = this.report();
    if (!r) return;
    // BOM so Excel reads ₹ and Indian scripts correctly.
    const blob = new Blob(['\uFEFF' + r.csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `zyppi-seller-tax-${r.month}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}
