import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { AuthService, MfaRequiredError, authErrorMessage } from '../../core/auth/auth.service';
import { ThemeService } from '../../core/theme/theme.service';

@Component({
  selector: 'z-login',
  imports: [
    ReactiveFormsModule,
    NzAlertModule,
    NzButtonModule,
    NzFormModule,
    NzIconModule,
    NzInputModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly theme = inject(ThemeService);

  readonly mode = signal<'signin' | 'reset' | 'totp'>('signin');
  readonly showPassword = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly info = signal<string | null>(null);

  readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    code: ['', [Validators.pattern(/^\d{6}$/)]],
  });

  async submit(): Promise<void> {
    this.error.set(null);
    this.info.set(null);
    const { email, password } = this.form.getRawValue();

    if (this.mode() === 'reset') {
      if (this.form.controls.email.invalid) {
        this.form.controls.email.markAsTouched();
        return;
      }
      await this.run(async () => {
        await this.auth.resetPassword(email);
        this.info.set('If that email has an account, a reset link is on its way.');
      });
      return;
    }

    if (this.mode() === 'totp') {
      const code = this.form.controls.code;
      if (!/^\d{6}$/.test(code.value)) {
        code.markAsTouched();
        return;
      }
      await this.run(async () => {
        await this.auth.verifyTotp(code.value);
        await this.goNext();
      });
      return;
    }

    if (this.form.controls.email.invalid || this.form.controls.password.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    await this.run(async () => {
      try {
        await this.auth.signIn(email, password);
      } catch (e) {
        if (e instanceof MfaRequiredError) {
          this.form.controls.code.setValue('');
          this.mode.set('totp');
          return;
        }
        throw e;
      }
      await this.goNext();
    });
  }

  private async goNext(): Promise<void> {
    const next = this.route.snapshot.queryParamMap.get('next');
    await this.router.navigateByUrl(next?.startsWith('/') ? next : '/');
  }

  switchMode(mode: 'signin' | 'reset' | 'totp'): void {
    this.mode.set(mode);
    this.error.set(null);
    this.info.set(null);
  }

  private async run(task: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await task();
    } catch (err) {
      this.error.set(authErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
