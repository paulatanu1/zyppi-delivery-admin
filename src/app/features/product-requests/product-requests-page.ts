import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzImageModule } from 'ng-zorro-antd/image';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { RupeesPipe } from '../../shared/pipes/rupees.pipe';
import { WhenPipe } from '../../shared/pipes/when.pipe';
import { PageHeader } from '../../shared/ui/page-header';
import { PageState } from '../../shared/ui/page-state';
import { printedGtin } from '../catalog/barcode';
import { ProductRequest, SellersApi } from '../sellers/sellers.api';
import { RequestDetails, toRequestDetails } from './request-details';

/** Catalog: products sellers asked to add or change. */
@Component({
  selector: 'z-product-requests-page',
  imports: [
    FormsModule,
    NzAlertModule,
    NzButtonModule,
    NzImageModule,
    NzInputModule,
    NzModalModule,
    NzTabsModule,
    NzTagModule,
    RupeesPipe,
    WhenPipe,
    PageHeader,
    PageState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <z-page-header
      title="Product requests"
      subtitle="New products and edits from sellers. Approving adds them to the catalogue; the seller then sets price and stock."
    />
    <z-page-state
      [status]="requests.status()"
      [error]="requests.error()"
      [empty]="(requests.value() ?? []).length === 0"
      emptyTitle="No requests yet"
      emptyText="Sellers send products from the Zyppi Seller app."
      (retry)="requests.retry()"
    >
      <nz-tabs
        [nzSelectedIndex]="showDone() ? 1 : 0"
        (nzSelectedIndexChange)="showDone.set($event === 1)"
      >
        <nz-tab [nzTitle]="'To review (' + pending().length + ')'"></nz-tab>
        <nz-tab nzTitle="Reviewed"></nz-tab>
      </nz-tabs>
      <div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(300px, 1fr))">
        @for (r of shown(); track r.id) {
          <div class="z-card p-4 flex gap-3">
            @if (r.payload.imageUrl) {
              <img
                nz-image
                [nzSrc]="r.payload.imageUrl"
                [alt]="r.payload.name"
                class="w-[84px] h-[84px] object-cover rounded"
              />
            }
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <b>{{ r.payload.name }}</b>
                @if (r.payload.brand) {
                  <span class="z-muted">{{ r.payload.brand }}</span>
                }
                <nz-tag [nzColor]="r.kind === 'new' ? 'purple' : 'blue'">{{
                  r.kind === 'new' ? 'New' : 'Edit'
                }}</nz-tag>
                @if (r.status !== 'pending') {
                  <nz-tag [nzColor]="r.status === 'approved' ? 'green' : 'red'">{{
                    r.status
                  }}</nz-tag>
                }
              </div>
              <div class="z-caption">{{ r.sellerName }} · {{ r.at | when }}</div>
              <div class="text-[13px] mt-1">
                @for (v of r.payload.variants; track $index) {
                  <span class="mr-2"
                    >{{ v.label }} · MRP {{ v.mrpPaise | rupees }}
                    @if (v.gtin) {
                      · <span class="font-mono">{{ barcode(v.gtin) }}</span>
                    }
                  </span>
                }
              </div>
              @if (details(r); as d) {
                <dl
                  class="text-[13px] m-0 mt-1 grid gap-x-2"
                  style="grid-template-columns: auto 1fr"
                >
                  @if (d.quantity) {
                    <dt class="z-muted">Net qty</dt>
                    <dd class="m-0">{{ d.quantity }}</dd>
                  }
                  @if (d.packaging) {
                    <dt class="z-muted">Packaging</dt>
                    <dd class="m-0">{{ d.packaging }}</dd>
                  }
                  @if (d.ingredients) {
                    <dt class="z-muted">Ingredients</dt>
                    <dd class="m-0 line-clamp-3">{{ d.ingredients }}</dd>
                  }
                  @if (d.allergens.length) {
                    <dt class="z-muted">Allergens</dt>
                    <dd class="m-0">{{ d.allergens.join(', ') }}</dd>
                  }
                  @if (d.nutrition) {
                    <dt class="z-muted">Nutrition</dt>
                    <dd class="m-0">{{ d.nutrition }}</dd>
                  }
                  @if (d.origin) {
                    <dt class="z-muted">Made in</dt>
                    <dd class="m-0">{{ d.origin }}</dd>
                  }
                  @if (d.labels.length) {
                    <dt class="z-muted">Labels</dt>
                    <dd class="m-0">{{ d.labels.join(', ') }}</dd>
                  }
                </dl>
                @if (d.provenance.length) {
                  <div class="flex gap-1 flex-wrap mt-1">
                    @for (p of d.provenance; track p.field) {
                      <nz-tag [nzColor]="p.value === 'off' ? 'cyan' : 'orange'">
                        {{ p.field }}:
                        {{ p.value === 'off' ? 'as in the database' : 'edited by seller' }}
                      </nz-tag>
                    }
                  </div>
                }
                @if (d.source; as s) {
                  <div class="z-caption mt-1">
                    Data from
                    <a [href]="s.url" target="_blank" rel="noopener noreferrer">{{ s.name }}</a>
                    (ODbL). Check it against the seller's photo; it can be wrong.
                  </div>
                }
              }
              @if (r.suggestedSubcategory; as sub) {
                <div class="mt-2 p-2 rounded border border-dashed border-[var(--z-line,#d9d9d9)]">
                  <div class="text-[13px]">
                    <b>New sub-category suggested</b>
                    @if (r.status !== 'pending') {
                      · {{ sub }}
                    }
                  </div>
                  @if (r.status === 'pending') {
                    <input
                      nz-input
                      nzSize="small"
                      class="mt-1"
                      maxlength="60"
                      aria-label="Sub-category name"
                      [disabled]="!!skipSub()[r.id]"
                      [ngModel]="subName()[r.id] ?? sub"
                      (ngModelChange)="setSubName(r.id, $event)"
                    />
                    <label class="text-[13px] flex items-center gap-1 mt-1">
                      <input
                        type="checkbox"
                        [checked]="!skipSub()[r.id]"
                        (change)="setSkipSub(r.id, !$any($event.target).checked)"
                      />
                      Create it when approving
                    </label>
                    <div class="z-caption">
                      If one with this name already exists in the category, the product goes there.
                    </div>
                  }
                </div>
              }
              @if (r.payload.description) {
                <p class="z-muted text-[13px] m-0 mt-1 line-clamp-3">{{ r.payload.description }}</p>
              }
              @if (r.status === 'pending') {
                <div class="flex gap-2 mt-2">
                  <button
                    nz-button
                    nzType="primary"
                    nzSize="small"
                    [nzLoading]="busy() === r.id"
                    (click)="approve(r)"
                  >
                    Approve
                  </button>
                  <button nz-button nzDanger nzSize="small" (click)="openReject(r)">Reject</button>
                </div>
              }
            </div>
          </div>
        } @empty {
          <p class="z-muted">Nothing here.</p>
        }
      </div>
    </z-page-state>

    <nz-modal
      [nzVisible]="!!rejecting()"
      nzTitle="Reject request"
      [nzCentered]="true"
      nzOkText="Reject"
      [nzOkDanger]="true"
      [nzOkLoading]="!!busy()"
      (nzOnOk)="reject()"
      (nzOnCancel)="rejecting.set(null)"
    >
      <ng-container *nzModalContent>
        <div class="flex flex-col gap-3">
          <p class="z-muted m-0">The seller sees this reason.</p>
          <textarea
            nz-input
            rows="3"
            maxlength="300"
            placeholder="e.g. Photo doesn’t show the product label"
            aria-label="Reason"
            [ngModel]="reason()"
            (ngModelChange)="reason.set($event)"
          ></textarea>
          @if (error(); as e) {
            <nz-alert nzType="error" nzShowIcon [nzMessage]="e" />
          }
        </div>
      </ng-container>
    </nz-modal>
  `,
})
export class ProductRequestsPage {
  private readonly api = inject(SellersApi);
  private readonly toast = inject(NzMessageService);

  readonly requests = this.api.watchProductRequests();
  readonly showDone = signal(false);
  readonly pending = computed(() =>
    (this.requests.value() ?? []).filter((r) => r.status === 'pending'),
  );
  readonly shown = computed(() =>
    this.showDone()
      ? (this.requests.value() ?? []).filter((r) => r.status !== 'pending')
      : this.pending(),
  );
  readonly busy = signal<string | null>(null);
  readonly rejecting = signal<ProductRequest | null>(null);
  readonly reason = signal('');
  readonly error = signal<string | null>(null);
  /** Per request: staff's tidied sub-category name, and whether to skip it. */
  readonly subName = signal<Record<string, string>>({});
  readonly skipSub = signal<Record<string, boolean>>({});

  setSubName(id: string, name: string): void {
    this.subName.update((m) => ({ ...m, [id]: name }));
  }

  setSkipSub(id: string, skip: boolean): void {
    this.skipSub.update((m) => ({ ...m, [id]: skip }));
  }

  private readonly detailsCache = new WeakMap<ProductRequest, RequestDetails | null>();

  details(r: ProductRequest): RequestDetails | null {
    if (!this.detailsCache.has(r)) this.detailsCache.set(r, toRequestDetails(r.payload.details));
    return this.detailsCache.get(r) ?? null;
  }

  barcode(gtin: string): string {
    return printedGtin(gtin);
  }

  async approve(r: ProductRequest): Promise<void> {
    this.busy.set(r.id);
    try {
      await this.api.reviewProductRequest(
        r.id,
        'approve',
        '',
        r.suggestedSubcategory
          ? {
              createSubcategory: !this.skipSub()[r.id],
              subcategoryName: (this.subName()[r.id] ?? r.suggestedSubcategory).trim(),
            }
          : {},
      );
      this.toast.success(`${r.payload.name} added to the catalogue`);
    } catch (e) {
      this.toast.error((e as Error).message);
    } finally {
      this.busy.set(null);
    }
  }

  openReject(r: ProductRequest): void {
    this.reason.set('');
    this.error.set(null);
    this.rejecting.set(r);
  }

  async reject(): Promise<void> {
    const r = this.rejecting();
    if (!r) return;
    this.busy.set(r.id);
    try {
      await this.api.reviewProductRequest(r.id, 'reject', this.reason().trim());
      this.rejecting.set(null);
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(null);
    }
  }
}
