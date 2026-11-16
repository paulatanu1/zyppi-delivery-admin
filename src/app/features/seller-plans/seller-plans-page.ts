import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzSegmentedModule } from 'ng-zorro-antd/segmented';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { RupeesPipe } from '../../shared/pipes/rupees.pipe';
import { PageHeader } from '../../shared/ui/page-header';
import { PageState } from '../../shared/ui/page-state';
import { SellersApi } from '../sellers/sellers.api';
import { Plan } from '../sellers/sellers.models';

/** Finance: subscription plans sellers pick when they apply. */
@Component({
  selector: 'z-seller-plans-page',
  imports: [
    FormsModule,
    NzAlertModule,
    NzButtonModule,
    NzIconModule,
    NzInputModule,
    NzInputNumberModule,
    NzModalModule,
    NzSegmentedModule,
    NzSwitchModule,
    NzTableModule,
    NzTagModule,
    RupeesPipe,
    PageHeader,
    PageState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <z-page-header
      title="Seller plans"
      subtitle="Subscription sellers pay one of these every period and set their own prices."
    >
      <button nz-button nzType="primary" (click)="edit(null)">
        <span nz-icon nzType="plus"></span>New plan
      </button>
    </z-page-header>
    <z-page-state
      [status]="plans.status()"
      [error]="plans.error()"
      [empty]="(plans.value() ?? []).length === 0"
      emptyTitle="No plans yet"
      emptyText="Create at least one plan before approving subscription sellers."
      (retry)="plans.retry()"
    >
      <div class="z-card overflow-hidden">
        <nz-table #t [nzData]="plans.value() ?? []" [nzShowPagination]="false">
          <thead>
            <tr>
              <th>Plan</th>
              <th>Period</th>
              <th>Fee</th>
              <th>Products on sale</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (p of t.data; track p.id) {
              <tr class="cursor-pointer" (click)="edit(p)">
                <td class="font-bold">
                  {{ p.name }}
                  @if (!p.isActive) {
                    <nz-tag>Hidden</nz-tag>
                  }
                </td>
                <td>{{ p.months }} month{{ p.months > 1 ? 's' : '' }}</td>
                <td class="font-bold">{{ p.feePaise | rupees }}</td>
                <td>{{ p.maxListings || 'No limit' }}</td>
                <td><span nz-icon nzType="edit" class="z-muted"></span></td>
              </tr>
            }
          </tbody>
        </nz-table>
      </div>
    </z-page-state>

    <nz-modal
      [nzVisible]="open()"
      [nzTitle]="draftId() ? 'Edit plan' : 'New plan'"
      [nzCentered]="true"
      nzOkText="Save"
      [nzOkLoading]="busy()"
      (nzOnOk)="save()"
      (nzOnCancel)="open.set(false)"
    >
      <ng-container *nzModalContent>
        <div class="flex flex-col gap-3">
          <input
            nz-input
            maxlength="60"
            placeholder="Name, e.g. Quarterly"
            aria-label="Name"
            [ngModel]="name()"
            (ngModelChange)="name.set($event)"
          />
          <nz-segmented
            [nzOptions]="[
              { label: '1 month', value: 1 },
              { label: '3 months', value: 3 },
              { label: '6 months', value: 6 },
            ]"
            [ngModel]="months()"
            (ngModelChange)="months.set($event)"
          />
          <label
            >Fee per period
            <nz-input-number
              class="!w-full"
              [nzMin]="0"
              [nzPrecision]="2"
              [ngModel]="feeRupees()"
              (ngModelChange)="feeRupees.set($event)"
              ><span nzInputPrefix>₹</span></nz-input-number
            >
          </label>
          <label
            >Most products on sale (0 = no limit)
            <nz-input-number
              class="!w-full"
              [nzMin]="0"
              [nzPrecision]="0"
              [ngModel]="maxListings()"
              (ngModelChange)="maxListings.set($event)"
            />
          </label>
          <label class="flex items-center gap-2"
            >Shown to new sellers
            <nz-switch [ngModel]="isActive()" (ngModelChange)="isActive.set($event)"
          /></label>
          @if (error(); as e) {
            <nz-alert nzType="error" nzShowIcon [nzMessage]="e" />
          }
        </div>
      </ng-container>
    </nz-modal>
  `,
})
export class SellerPlansPage {
  private readonly api = inject(SellersApi);
  private readonly toast = inject(NzMessageService);

  readonly plans = this.api.watchPlans();
  readonly open = signal(false);
  readonly draftId = signal<string | null>(null);
  readonly name = signal('');
  readonly months = signal<1 | 3 | 6>(1);
  readonly feeRupees = signal<number | null>(null);
  readonly maxListings = signal<number | null>(0);
  readonly isActive = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  edit(p: Plan | null): void {
    this.draftId.set(p?.id ?? null);
    this.name.set(p?.name ?? '');
    this.months.set(p?.months ?? 1);
    this.feeRupees.set(p ? p.feePaise / 100 : null);
    this.maxListings.set(p?.maxListings ?? 0);
    this.isActive.set(p?.isActive ?? true);
    this.error.set(null);
    this.open.set(true);
  }

  async save(): Promise<void> {
    this.busy.set(true);
    try {
      await this.api.savePlan({
        ...(this.draftId() ? { id: this.draftId()! } : {}),
        name: this.name().trim(),
        months: this.months(),
        feePaise: Math.round((this.feeRupees() ?? 0) * 100),
        maxListings: this.maxListings() ?? 0,
        isActive: this.isActive(),
      });
      this.toast.success('Plan saved');
      this.open.set(false);
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
