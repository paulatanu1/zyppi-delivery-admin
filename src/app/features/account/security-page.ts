import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { AuthService, TotpEnrolment, authErrorMessage } from '../../core/auth/auth.service';
import { Confirm } from '../../shared/ui/confirm';
import { PageHeader } from '../../shared/ui/page-header';

/** 2-step sign-in with an authenticator app (TOTP); required for super admins. */
@Component({
  selector: 'z-security-page',
  imports: [
    FormsModule,
    NzAlertModule,
    NzButtonModule,
    NzIconModule,
    NzInputModule,
    NzTagModule,
    PageHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <z-page-header
      title="Account security"
      subtitle="2-step sign-in asks for a code from an authenticator app (Google Authenticator, Microsoft Authenticator, Authy…) after your password."
    />

    <div class="z-card p-5 max-w-xl">
      <div class="flex items-center gap-3 mb-3">
        <span class="font-extrabold flex-1">Authenticator app</span>
        @if (enrolled()) {
          <nz-tag nzColor="green">On</nz-tag>
        } @else {
          <nz-tag>Off</nz-tag>
        }
      </div>

      @if (isSuper() && !enrolled()) {
        <nz-alert
          nzType="warning"
          nzShowIcon
          class="block mb-4"
          nzMessage="Super admins must use 2-step sign-in. Once it’s required, super-admin actions stop working without it."
        />
      }
      @if (enrolled() && !usedThisSession()) {
        <nz-alert
          nzType="info"
          nzShowIcon
          class="block mb-4"
          nzMessage="This session was signed in before the code was set up. Sign out and in again to use it."
        />
      }
      @if (error(); as e) {
        <nz-alert nzType="error" nzShowIcon class="block mb-4" [nzMessage]="e" />
      }

      @if (enrolment(); as e) {
        <ol class="pl-5 flex flex-col gap-3">
          <li>
            In your authenticator app, add an account and type this key (or, on this phone,
            <a [href]="e.url">open it in the app</a>):
            <code class="key">{{ grouped(e.secretKey) }}</code>
            <button nz-button nzSize="small" class="mt-2" (click)="copy(e.secretKey)">
              <span nz-icon nzType="copy"></span>Copy key
            </button>
          </li>
          <li>
            <label for="totp-code">Enter the 6-digit code it shows:</label>
            <div class="flex gap-2 mt-1">
              <input
                nz-input
                id="totp-code"
                inputmode="numeric"
                autocomplete="one-time-code"
                maxlength="6"
                class="max-w-[160px] tracking-[.3em] text-center"
                [ngModel]="code()"
                (ngModelChange)="code.set($event)"
              />
              <button
                nz-button
                nzType="primary"
                [nzLoading]="busy()"
                [disabled]="!validCode()"
                (click)="finish(e)"
              >
                Turn on
              </button>
              <button nz-button (click)="enrolment.set(null)">Cancel</button>
            </div>
          </li>
        </ol>
      } @else if (enrolled()) {
        <button nz-button nzDanger [nzLoading]="busy()" (click)="remove()">
          Remove authenticator
        </button>
      } @else {
        <button nz-button nzType="primary" [nzLoading]="busy()" (click)="start()">
          <span nz-icon nzType="safety-certificate"></span>Set up 2-step sign-in
        </button>
      }

      @if (needsVerify()) {
        <div class="mt-4">
          <button nz-button (click)="verifyEmail()">Send verification email</button>
        </div>
      }
      @if (needsReauth()) {
        <div class="mt-4">
          <button nz-button (click)="signOutAndIn()">Sign out and sign in again</button>
        </div>
      }
    </div>
  `,
  styles: `
    .key {
      display: block;
      margin-top: 8px;
      padding: 10px 12px;
      border-radius: var(--z-radius-control);
      background: var(--z-surface-2);
      font-size: 15px;
      letter-spacing: 0.08em;
      word-break: break-all;
    }
  `,
})
export class SecurityPage {
  private readonly auth = inject(AuthService);
  private readonly message = inject(NzMessageService);
  private readonly confirm = inject(Confirm);
  private readonly router = inject(Router);

  readonly enrolled = computed(() => this.auth.session()?.mfaEnrolled ?? false);
  readonly usedThisSession = computed(() => !!this.auth.session()?.secondFactor);
  readonly isSuper = computed(() => this.auth.role() === 'super_admin');
  readonly enrolment = signal<TotpEnrolment | null>(null);
  readonly code = signal('');
  readonly validCode = computed(() => /^\d{6}$/.test(this.code().trim()));
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly needsReauth = signal(false);
  readonly needsVerify = signal(false);

  verifyEmail(): Promise<void> {
    return this.run(async () => {
      await this.auth.sendVerificationEmail();
      this.message.success('Verification link sent. Open it, then sign in again.');
    });
  }

  grouped(key: string): string {
    return key.replace(/(.{4})/g, '$1 ').trim();
  }

  async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.message.success('Key copied');
    } catch {
      this.message.info('Select the key and copy it');
    }
  }

  private async run(task: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.needsReauth.set(false);
    this.needsVerify.set(false);
    try {
      await task();
    } catch (e) {
      this.error.set(authErrorMessage(e));
      if ((e as { code?: string }).code === 'auth/requires-recent-login')
        this.needsReauth.set(true);
      if ((e as { code?: string }).code === 'auth/unverified-email') this.needsVerify.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  start(): Promise<void> {
    return this.run(async () => {
      this.code.set('');
      this.enrolment.set(await this.auth.startTotpEnrolment());
    });
  }

  finish(e: TotpEnrolment): Promise<void> {
    return this.run(async () => {
      await this.auth.finishTotpEnrolment(e, this.code());
      this.enrolment.set(null);
      this.message.success('2-step sign-in is on. Sign in again to use it in this session.');
    });
  }

  async remove(): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Remove the authenticator?',
      content: this.isSuper()
        ? 'Super-admin actions may stop working until you set it up again.'
        : 'You’ll sign in with only your password.',
      okText: 'Remove',
      danger: true,
    });
    if (!ok) return;
    await this.run(async () => {
      await this.auth.removeTotp();
      this.message.success('Authenticator removed');
    });
  }

  async signOutAndIn(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigate(['/login'], { queryParams: { next: '/account/security' } });
  }
}
