import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzImageModule } from 'ng-zorro-antd/image';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { AuthService } from '../../core/auth/auth.service';
import { hasRole } from '../../core/auth/roles';
import { formatPaise, RupeesPipe } from '../../shared/pipes/rupees.pipe';
import { WhenPipe } from '../../shared/pipes/when.pipe';
import { PageHeader } from '../../shared/ui/page-header';
import { PageState } from '../../shared/ui/page-state';
import { ClaimsApi } from './claims.api';
import {
  Claim,
  ClaimResolution,
  KIND_LABEL,
  REPEAT_CLAIMS,
  RESOLUTION_LABEL,
  STATUS_META,
  claimAmountPaise,
  hasMarketplaceLine,
  payableLeft,
  resolutionsFor,
  suggestSellerAtFault,
} from './claims.models';

/**
 * Operations → Claims: "Report a problem" from customers (2 hours after
 * delivery). Approve with wallet credit, a refund to the original payment
 * or a free replacement, optionally charging the seller; or reject with a
 * reason the customer sees.
 */
@Component({
  selector: 'z-claims-page',
  imports: [
    FormsModule,
    RouterLink,
    NzAlertModule,
    NzButtonModule,
    NzCheckboxModule,
    NzImageModule,
    NzInputModule,
    NzModalModule,
    NzRadioModule,
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
      title="Claims"
      subtitle="Missing, wrong, damaged or expired items reported within 2 hours of delivery. Cash orders are always paid back to the wallet."
    />
    <nz-tabs [nzSelectedIndex]="tab()" (nzSelectedIndexChange)="tab.set($event)">
      <nz-tab [nzTitle]="'To review (' + (open.value() ?? []).length + ')'"></nz-tab>
      <nz-tab [nzTitle]="'Return pickups (' + (returning.value() ?? []).length + ')'"></nz-tab>
      <nz-tab nzTitle="Reviewed"></nz-tab>
    </nz-tabs>
    <z-page-state
      [status]="list().status()"
      [error]="list().error()"
      [empty]="(list().value() ?? []).length === 0"
      [emptyTitle]="
        tab() === 0
          ? 'No claims to review'
          : tab() === 1
            ? 'No return pickups under way'
            : 'No reviewed claims yet'
      "
      emptyText="Customers report problems from Order details in the app."
      (retry)="list().retry()"
    >
      <div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(320px, 1fr))">
        @for (c of list().value() ?? []; track c.id) {
          <article class="z-card p-4 flex flex-col gap-2">
            <div class="flex items-center gap-2 flex-wrap">
              @if (canOrders()) {
                <a class="font-bold" [routerLink]="['/orders', c.orderId]">#{{ c.shortOrderId }}</a>
              } @else {
                <b>#{{ c.shortOrderId }}</b>
              }
              <nz-tag [nzColor]="statusMeta[c.status].color">{{
                statusMeta[c.status].label
              }}</nz-tag>
              <span class="z-caption flex-1">{{ c.createdAt | when }}</span>
              <b>{{ c.amountPaise | rupees }}</b>
            </div>
            <ul class="list-none p-0 m-0 text-[13px]">
              @for (l of c.lines; track l.index) {
                <li class="flex gap-2">
                  <span class="flex-1">{{ l.quantity }} × {{ l.name }}</span>
                  <nz-tag>{{ kindLabel[l.kind] }}</nz-tag>
                </li>
              }
            </ul>
            @if (c.note) {
              <p class="m-0 text-[13px]">“{{ c.note }}”</p>
            }
            @if (c.photos.length) {
              <div class="flex gap-2 flex-wrap">
                @for (p of c.photos; track p) {
                  @if (urls()[p]; as u) {
                    <img
                      nz-image
                      [nzSrc]="u"
                      alt="Photo from the customer"
                      class="w-[72px] h-[72px] object-cover rounded"
                    />
                  } @else {
                    <button nz-button nzSize="small" (click)="loadPhoto(p)">Show photo</button>
                  }
                }
              </div>
            } @else {
              <span class="z-caption">No photos (missing item)</span>
            }
            <div class="z-caption">
              Wants: {{ resolutionLabel[c.resolutionWanted] }} · Paid by
              {{ c.paymentMethod ?? '—' }}
              @if (counts()[c.userId ?? ''] !== undefined) {
                · {{ counts()[c.userId ?? ''] }} claim(s) all time
                @if ((counts()[c.userId ?? ''] ?? 0) >= repeat) {
                  <nz-tag nzColor="red">Repeat claimer</nz-tag>
                }
              }
            </div>
            @if (c.reviewReason && c.status === 'open') {
              <div class="z-caption">Needs ops: {{ c.reviewReason }}</div>
            }
            @if (c.lastError && c.lastError !== c.reviewReason) {
              <nz-alert nzType="warning" nzShowIcon [nzMessage]="c.lastError" />
            }
            @if (c.autoReturn) {
              <div class="z-caption">
                Automatic return ·
                <a routerLink="/returns">{{ c.returnIds.length }} pickup(s)</a>
                @if (c.returnPaidPaise) {
                  · {{ c.returnPaidPaise | rupees }} already paid
                }
              </div>
            }
            @if (c.status === 'approved') {
              <div class="text-[13px]">
                {{
                  resolutionLabel[
                    c.resolution.type === 'rejected' || !c.resolution.type
                      ? 'wallet'
                      : c.resolution.type
                  ]
                }}
                @if (c.resolution.walletPaise) {
                  · {{ c.resolution.walletPaise | rupees }} to wallet
                }
                @if (c.resolution.refundPaise) {
                  · {{ c.resolution.refundPaise | rupees }} refunded
                }
                @if (c.resolution.replacementOrderId; as r) {
                  · <a [routerLink]="['/orders', r]">replacement order</a>
                }
                @if (c.resolution.sellerDebitPaise) {
                  · seller charged {{ c.resolution.sellerDebitPaise | rupees }}
                }
              </div>
            }
            @if (c.status === 'rejected' && c.rejectReason) {
              <div class="text-[13px] z-muted">Rejected: {{ c.rejectReason }}</div>
            }
            @if (c.status === 'open' && canDecide()) {
              <div class="flex gap-2 mt-1">
                <button nz-button nzType="primary" nzSize="small" (click)="openApprove(c)">
                  Approve…
                </button>
                <button nz-button nzDanger nzSize="small" (click)="openReject(c)">Reject…</button>
              </div>
            }
          </article>
        }
      </div>
    </z-page-state>

    <nz-modal
      [nzVisible]="!!approving()"
      nzTitle="Approve claim"
      [nzCentered]="true"
      nzOkText="Approve"
      [nzOkLoading]="busy()"
      [nzOkDisabled]="!canSubmitApprove()"
      (nzOnOk)="approve()"
      (nzOnCancel)="approving.set(null)"
    >
      <ng-container *nzModalContent>
        @if (approving(); as c) {
          <div class="flex flex-col gap-3">
            <nz-radio-group [ngModel]="resolution()" (ngModelChange)="resolution.set($event)">
              @for (r of resolutions(); track r) {
                <div nz-radio [nzValue]="r" class="block">{{ resolutionLabel[r] }}</div>
              }
            </nz-radio-group>
            @if (resolution() !== 'replacement') {
              <div>
                <label for="claim-amount" class="font-bold">Amount (₹)</label>
                <input
                  nz-input
                  id="claim-amount"
                  inputmode="decimal"
                  class="mt-1"
                  [ngModel]="amount()"
                  (ngModelChange)="amount.set($event)"
                />
                <div class="z-caption mt-1">
                  Up to {{ payableLeft(c) | rupees }} (item price less its share of the coupon{{
                    c.returnPaidPaise ? ', less what returns already paid' : ''
                  }}).
                  @if (resolution() === 'original') {
                    Any part the online payment can’t take goes to the wallet.
                  }
                </div>
              </div>
            } @else {
              <p class="z-muted m-0">
                A free order for the same items, from the same seller if they have stock, otherwise
                the best seller in the area. If nothing is in stock you’ll be told, and can choose
                the wallet instead.
              </p>
            }
            @if (marketplace()) {
              <div
                nz-checkbox
                [ngModel]="sellerAtFault()"
                (ngModelChange)="sellerAtFault.set($event)"
              >
                Seller at fault: take back their earnings for these units
              </div>
            }
            <textarea
              nz-input
              rows="2"
              maxlength="300"
              placeholder="Note for the audit log (optional)"
              aria-label="Note"
              [ngModel]="note()"
              (ngModelChange)="note.set($event)"
            ></textarea>
            @if (error(); as e) {
              <nz-alert nzType="error" nzShowIcon [nzMessage]="e" />
            }
          </div>
        }
      </ng-container>
    </nz-modal>

    <nz-modal
      [nzVisible]="!!rejecting()"
      nzTitle="Reject claim"
      [nzCentered]="true"
      nzOkText="Reject"
      [nzOkDanger]="true"
      [nzOkLoading]="busy()"
      [nzOkDisabled]="note().trim().length < 3"
      (nzOnOk)="reject()"
      (nzOnCancel)="rejecting.set(null)"
    >
      <ng-container *nzModalContent>
        <div class="flex flex-col gap-3">
          <p class="z-muted m-0">
            The customer sees this reason. While the 2 hours are still running they can report
            again.
          </p>
          <textarea
            nz-input
            rows="3"
            maxlength="300"
            placeholder="e.g. The photo shows a sealed, undamaged pack"
            aria-label="Reason"
            [ngModel]="note()"
            (ngModelChange)="note.set($event)"
          ></textarea>
          @if (error(); as e) {
            <nz-alert nzType="error" nzShowIcon [nzMessage]="e" />
          }
        </div>
      </ng-container>
    </nz-modal>
  `,
})
export class ClaimsPage {
  private readonly api = inject(ClaimsApi);
  private readonly toast = inject(NzMessageService);
  private readonly auth = inject(AuthService);

  readonly statusMeta = STATUS_META;
  readonly kindLabel = KIND_LABEL;
  readonly resolutionLabel = RESOLUTION_LABEL;
  readonly repeat = REPEAT_CLAIMS;
  readonly payableLeft = payableLeft;

  readonly open = this.api.watchOpen();
  readonly reviewed = this.api.watchReviewed();
  readonly tab = signal(0);
  readonly returning = this.api.watchReturning();
  readonly list = computed(() =>
    this.tab() === 0 ? this.open : this.tab() === 1 ? this.returning : this.reviewed,
  );

  /** adminResolveIssue / adminRejectIssue allow these roles. */
  readonly canDecide = computed(() => hasRole(this.auth.role(), ['ops', 'finance']));
  readonly canOrders = computed(() => hasRole(this.auth.role(), ['ops', 'support']));

  readonly urls = signal<Record<string, string>>({});
  readonly counts = signal<Record<string, number>>({});

  readonly approving = signal<Claim | null>(null);
  readonly rejecting = signal<Claim | null>(null);
  readonly resolution = signal<ClaimResolution>('wallet');
  readonly amount = signal('');
  readonly sellerAtFault = signal(false);
  readonly note = signal('');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly resolutions = computed(() => {
    const c = this.approving();
    return c ? resolutionsFor(c) : [];
  });
  readonly marketplace = computed(() => {
    const c = this.approving();
    return !!c && hasMarketplaceLine(c);
  });
  readonly canSubmitApprove = computed(() => {
    const c = this.approving();
    if (!c || this.busy()) return false;
    return (
      this.resolution() === 'replacement' || claimAmountPaise(this.amount(), payableLeft(c)) != null
    );
  });

  async loadPhoto(path: string): Promise<void> {
    try {
      const url = await this.api.photoUrl(path);
      this.urls.update((u) => ({ ...u, [path]: url }));
    } catch (e) {
      this.toast.error((e as Error).message || 'Couldn’t load the photo');
    }
  }

  private async loadCount(uid: string | null): Promise<void> {
    if (!uid || this.counts()[uid] !== undefined) return;
    try {
      const n = await this.api.claimCount(uid);
      this.counts.update((c) => ({ ...c, [uid]: n }));
    } catch {
      // Only a hint for staff; the claim can still be decided.
    }
  }

  openApprove(c: Claim): void {
    this.error.set(null);
    this.note.set('');
    this.resolution.set(
      resolutionsFor(c).includes(c.resolutionWanted) ? c.resolutionWanted : 'wallet',
    );
    const left = payableLeft(c);
    this.amount.set((left / 100).toFixed(left % 100 ? 2 : 0));
    this.sellerAtFault.set(suggestSellerAtFault(c));
    this.approving.set(c);
    void this.loadCount(c.userId);
    for (const p of c.photos) void this.loadPhoto(p);
  }

  openReject(c: Claim): void {
    this.error.set(null);
    this.note.set('');
    this.rejecting.set(c);
    void this.loadCount(c.userId);
  }

  async approve(): Promise<void> {
    const c = this.approving();
    if (!c) return;
    const resolution = this.resolution();
    const amountPaise =
      resolution === 'replacement' ? null : claimAmountPaise(this.amount(), payableLeft(c));
    this.busy.set(true);
    this.error.set(null);
    try {
      const r = await this.api.resolve(
        c.id,
        resolution,
        amountPaise,
        this.marketplace() && this.sellerAtFault(),
        this.note().trim(),
      );
      this.approving.set(null);
      this.toast.success(
        r.replacementOrderId
          ? 'Replacement order created'
          : [
              r.walletPaise ? `${formatPaise(r.walletPaise)} to wallet` : '',
              r.refundPaise ? `${formatPaise(r.refundPaise)} refunded` : '',
            ]
              .filter(Boolean)
              .join(', ') || 'Claim approved',
      );
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  async reject(): Promise<void> {
    const c = this.rejecting();
    if (!c) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.reject(c.id, this.note().trim());
      this.rejecting.set(null);
      this.toast.success('Claim rejected; the customer was told why');
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
