import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzImageModule } from 'ng-zorro-antd/image';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { AuthService } from '../../core/auth/auth.service';
import { hasRole } from '../../core/auth/roles';
import { RupeesPipe } from '../../shared/pipes/rupees.pipe';
import { WhenPipe } from '../../shared/pipes/when.pipe';
import { PageHeader } from '../../shared/ui/page-header';
import { PageState } from '../../shared/ui/page-state';
import { ClaimsConfig, DEFAULT_CLAIMS_CONFIG, ReturnsApi } from './returns.api';
import { RETURN_META, ReturnDoc, isActive, limitPaise } from './returns.models';

const KIND: Record<string, string> = {
  wrong: 'Wrong item',
  damaged: 'Damaged',
  expired: 'Expired',
  missing: 'Missing',
};

/**
 * Operations → Returns: automatic return pickups (a rider collects from
 * the customer, the store receives, the refund goes out on its own).
 * Ops watch for unassigned or stuck ones, cancel or send them to the
 * Claims queue, and set the automatic limits and dark-store staff logins.
 */
@Component({
  selector: 'z-returns-page',
  imports: [
    FormsModule,
    RouterLink,
    NzAlertModule,
    NzButtonModule,
    NzImageModule,
    NzInputModule,
    NzModalModule,
    NzSwitchModule,
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
      title="Returns"
      subtitle="Wrong, damaged or expired items within the limits go straight to a rider pickup. The refund goes out when the store receives them."
    />
    <nz-tabs [nzSelectedIndex]="tab()" (nzSelectedIndexChange)="tab.set($event)">
      <nz-tab [nzTitle]="'Active (' + (active.value() ?? []).length + ')'"></nz-tab>
      <nz-tab nzTitle="Finished"></nz-tab>
      @if (canSettings()) {
        <nz-tab nzTitle="Settings"></nz-tab>
      }
    </nz-tabs>

    @if (tab() < 2) {
      <z-page-state
        [status]="list().status()"
        [error]="list().error()"
        [empty]="(list().value() ?? []).length === 0"
        [emptyTitle]="tab() === 0 ? 'No returns under way' : 'No finished returns yet'"
        emptyText="Customers start returns from the support chat or Order details."
        (retry)="list().retry()"
      >
        <div
          class="grid gap-3"
          style="grid-template-columns: repeat(auto-fill, minmax(320px, 1fr))"
        >
          @for (r of list().value() ?? []; track r.id) {
            <article class="z-card p-4 flex flex-col gap-2">
              <div class="flex items-center gap-2 flex-wrap">
                <a class="font-bold" [routerLink]="['/orders', r.orderId]">#{{ r.shortOrderId }}</a>
                <nz-tag [nzColor]="meta[r.status].color">{{ meta[r.status].label }}</nz-tag>
                @if (r.unassigned) {
                  <nz-tag nzColor="red">No rider</nz-tag>
                }
                <span class="z-caption flex-1">{{ r.createdAt | when }}</span>
                <b>{{ r.amountPaise | rupees }}</b>
              </div>
              <div class="text-[13px]">
                To <b>{{ r.storeName }}</b>{{ r.sellerId === 'zyppi' ? ' (Zyppi)' : '' }}
                @if (r.riderName) {
                  · Rider {{ r.riderName }}
                  @if (r.riderPhone) {
                    <a [href]="'tel:' + r.riderPhone">{{ r.riderPhone }}</a>
                  }
                }
              </div>
              <ul class="list-none p-0 m-0 text-[13px]">
                @for (l of r.lines; track l.index) {
                  <li>{{ l.quantity }} × {{ l.name }} · {{ kind[l.kind] ?? l.kind }}</li>
                }
              </ul>
              <div class="z-caption">
                Refund as: {{ r.resolution }}
                @if (r.tries) {
                  · {{ r.tries }} failed visit(s)
                }
              </div>
              @if (r.mismatchNote) {
                <nz-alert nzType="warning" nzShowIcon [nzMessage]="'Rider: ' + r.mismatchNote" />
              }
              @if (r.settleError) {
                <nz-alert
                  nzType="error"
                  nzShowIcon
                  [nzMessage]="'Refund failed: ' + r.settleError"
                />
              }
              @if (r.pickupPhotos.length || r.mismatchPhotos.length) {
                <div class="flex gap-2 flex-wrap">
                  @for (p of [...r.pickupPhotos, ...r.mismatchPhotos]; track p) {
                    @if (urls()[p]; as u) {
                      <img
                        nz-image
                        [nzSrc]="u"
                        alt="Rider's photo"
                        class="w-[64px] h-[64px] object-cover rounded"
                      />
                    } @else {
                      <button nz-button nzSize="small" (click)="loadPhoto(p)">Photo</button>
                    }
                  }
                </div>
              }
              @if (isActive(r) && canAct()) {
                <div class="flex gap-2">
                  <button nz-button nzSize="small" (click)="open(r, 'review')">
                    Send to Claims…
                  </button>
                  <button nz-button nzDanger nzSize="small" (click)="open(r, 'cancel')">
                    Cancel…
                  </button>
                </div>
              }
            </article>
          }
        </div>
      </z-page-state>
    } @else {
      <div class="grid gap-4" style="grid-template-columns: repeat(auto-fill, minmax(320px, 1fr))">
        <section class="z-card p-4 flex flex-col gap-3">
          <h3 class="m-0">Automatic returns</h3>
          <label class="flex items-center gap-2" for="auto-switch">
            <nz-switch
              id="auto-switch"
              [ngModel]="cfg().autoReturns"
              (ngModelChange)="patch({ autoReturns: $event })"
            />
            Skip ops for wrong, damaged and expired items within these limits
          </label>
          <div>
            <label for="max-rupees" class="font-bold">Up to (₹)</label>
            <input
              nz-input
              id="max-rupees"
              inputmode="numeric"
              class="mt-1"
              [ngModel]="maxRupees()"
              (ngModelChange)="maxRupees.set($event)"
            />
          </div>
          <div>
            <label for="max-claims" class="font-bold"
              >Ops review from this many claims in 30 days</label
            >
            <input
              nz-input
              id="max-claims"
              inputmode="numeric"
              class="mt-1"
              [ngModel]="maxClaims()"
              (ngModelChange)="maxClaims.set($event)"
            />
          </div>
          <p class="z-caption m-0">Missing items always go to ops.</p>
          <button nz-button nzType="primary" [nzLoading]="busy()" (click)="saveConfig()">
            Save
          </button>
        </section>
        <section class="z-card p-4 flex flex-col gap-3">
          <h3 class="m-0">Dark-store staff logins</h3>
          <p class="z-muted m-0">
            Staff at Zyppi's own stores sign in to the Zyppi Seller app with this email to get
            return alerts and receive returns. They must sign in to the app once first. Older logins
            can still be found by their 10-digit mobile number.
          </p>
          <input
            nz-input
            inputmode="email"
            placeholder="Email (or 10-digit mobile)"
            aria-label="Staff login email or mobile"
            [ngModel]="staffLogin()"
            (ngModelChange)="staffLogin.set($event)"
          />
          <div class="flex gap-2">
            <button nz-button nzType="primary" [nzLoading]="busy()" (click)="staff('add')">
              Add
            </button>
            <button nz-button nzDanger [nzLoading]="busy()" (click)="staff('remove')">
              Remove
            </button>
          </div>
        </section>
      </div>
    }

    <nz-modal
      [nzVisible]="!!acting()"
      [nzTitle]="actionKind() === 'cancel' ? 'Cancel this return?' : 'Send to the Claims queue?'"
      [nzCentered]="true"
      [nzOkText]="actionKind() === 'cancel' ? 'Cancel return' : 'Send'"
      [nzOkDanger]="actionKind() === 'cancel'"
      [nzOkLoading]="busy()"
      [nzOkDisabled]="reason().trim().length < 3"
      (nzOnOk)="act()"
      (nzOnCancel)="acting.set(null)"
    >
      <ng-container *nzModalContent>
        <p class="z-muted">
          {{
            actionKind() === 'cancel'
              ? 'The rider is released and nothing is refunded. The customer can contact support.'
              : 'The rider is released and the claim waits for a decision in Claims.'
          }}
        </p>
        <textarea
          nz-input
          rows="3"
          maxlength="300"
          aria-label="Reason"
          placeholder="Reason (for the audit log)"
          [ngModel]="reason()"
          (ngModelChange)="reason.set($event)"
        ></textarea>
      </ng-container>
    </nz-modal>
  `,
})
export class ReturnsPage {
  private readonly api = inject(ReturnsApi);
  private readonly toast = inject(NzMessageService);
  private readonly auth = inject(AuthService);

  readonly meta = RETURN_META;
  readonly kind = KIND;
  readonly isActive = isActive;

  readonly active = this.api.watchActive();
  readonly recent = this.api.watchRecent();
  readonly tab = signal(0);
  readonly list = computed(() => (this.tab() === 0 ? this.active : this.recent));

  /** adminUpdateReturn / adminSetZyppiStoreStaff: ops. Limits: ops and finance. */
  readonly canAct = computed(() => hasRole(this.auth.role(), ['ops']));
  readonly canSettings = computed(() => hasRole(this.auth.role(), ['ops', 'finance']));

  readonly urls = signal<Record<string, string>>({});
  readonly acting = signal<ReturnDoc | null>(null);
  readonly actionKind = signal<'cancel' | 'review'>('review');
  readonly reason = signal('');
  readonly busy = signal(false);

  readonly cfg = signal<ClaimsConfig>(DEFAULT_CLAIMS_CONFIG);
  readonly maxRupees = signal(String(DEFAULT_CLAIMS_CONFIG.autoMaxPaise / 100));
  readonly maxClaims = signal(String(DEFAULT_CLAIMS_CONFIG.autoMaxClaims30d));
  readonly staffLogin = signal('');

  constructor() {
    void this.loadConfig();
  }

  private async loadConfig(): Promise<void> {
    try {
      const c = await this.api.config();
      this.cfg.set(c);
      this.maxRupees.set(String(Math.round(c.autoMaxPaise / 100)));
      this.maxClaims.set(String(c.autoMaxClaims30d));
    } catch {
      // Roles without access keep the defaults on screen; Save will say why.
    }
  }

  patch(p: Partial<ClaimsConfig>): void {
    this.cfg.update((c) => ({ ...c, ...p }));
  }

  async loadPhoto(path: string): Promise<void> {
    try {
      const url = await this.api.photoUrl(path);
      this.urls.update((u) => ({ ...u, [path]: url }));
    } catch (e) {
      this.toast.error((e as Error).message || 'Couldn’t load the photo');
    }
  }

  open(r: ReturnDoc, kind: 'cancel' | 'review'): void {
    this.reason.set('');
    this.actionKind.set(kind);
    this.acting.set(r);
  }

  async act(): Promise<void> {
    const r = this.acting();
    if (!r) return;
    this.busy.set(true);
    try {
      await this.api.update(r.id, this.actionKind(), this.reason().trim());
      this.acting.set(null);
      this.toast.success(this.actionKind() === 'cancel' ? 'Return cancelled' : 'Sent to Claims');
    } catch (e) {
      this.toast.error((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  async saveConfig(): Promise<void> {
    const max = limitPaise(this.maxRupees());
    const claims = Number(this.maxClaims());
    if (max === null) {
      this.toast.error('Enter the limit in whole rupees');
      return;
    }
    if (!Number.isInteger(claims) || claims < 1 || claims > 100) {
      this.toast.error('Enter between 1 and 100 claims');
      return;
    }
    this.busy.set(true);
    try {
      const next = { ...this.cfg(), autoMaxPaise: max, autoMaxClaims30d: claims };
      await this.api.saveConfig(next);
      this.cfg.set(next);
      this.toast.success('Saved');
    } catch (e) {
      this.toast.error((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  async staff(action: 'add' | 'remove'): Promise<void> {
    this.busy.set(true);
    try {
      await this.api.setStaff(this.staffLogin().trim(), action);
      this.toast.success(action === 'add' ? 'Added: they can sign in now' : 'Removed');
      this.staffLogin.set('');
    } catch (e) {
      this.toast.error((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
