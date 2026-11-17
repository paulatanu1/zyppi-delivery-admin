import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzResultModule } from 'ng-zorro-antd/result';
import { NzSegmentedModule } from 'ng-zorro-antd/segmented';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzStepsModule } from 'ng-zorro-antd/steps';
import { AuthService } from '../../core/auth/auth.service';
import { RiderAuthService, riderAuthError } from '../../core/auth/rider-auth.service';
import { ThemeService } from '../../core/theme/theme.service';
import { RupeesPipe } from '../../shared/pipes/rupees.pipe';
import { RidersApi } from '../riders/riders.api';
import {
  DOCS,
  DocKey,
  PayoutInput,
  Rider,
  STATUS_META,
  VEHICLES,
  VehicleType,
  isMotor,
  stepProblems,
} from '../riders/riders.models';
import { KycUpload } from './kyc-upload';
import { LegalSign } from './legal-sign';

interface Form {
  fullName: string;
  phone: string;
  dob: string;
  gender: string | null;
  address: string;
  serviceAreaId: string;
  vehicleType: VehicleType | '';
  vehicleNumber: string;
  drivingLicenceNumber: string;
  docs: Partial<Record<DocKey, string>>;
}

const EMPTY: Form = {
  fullName: '',
  phone: '',
  dob: '',
  gender: null,
  address: '',
  serviceAreaId: '',
  vehicleType: '',
  vehicleNumber: '',
  drivingLicenceNumber: '',
  docs: {},
};

/** Public "Ride with Zyppi" portal: sign in, apply, follow the review. */
@Component({
  selector: 'z-rider-portal',
  imports: [
    FormsModule,
    NzAlertModule,
    NzButtonModule,
    NzIconModule,
    NzInputModule,
    NzResultModule,
    NzSegmentedModule,
    NzSelectModule,
    NzSpinModule,
    NzStepsModule,
    RupeesPipe,
    KycUpload,
    LegalSign,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rider-portal.html',
  styleUrl: './rider-portal.scss',
})
export class RiderPortal {
  private readonly auth = inject(AuthService);
  private readonly riderAuth = inject(RiderAuthService);
  private readonly api = inject(RidersApi);
  protected readonly theme = inject(ThemeService);

  readonly session = this.auth.session;
  readonly ready = this.auth.ready;

  // Sign-in
  readonly otpOn = signal(true);
  readonly phone10 = signal('');
  readonly code = signal('');
  readonly codeSent = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  // Application
  readonly rider = signal<Rider | null | undefined>(undefined);
  readonly editing = signal(false);
  readonly step = signal(0);
  readonly form = signal<Form>({ ...EMPTY });
  readonly payout = signal<PayoutInput>({
    method: 'upi',
    upiId: '',
    accountName: '',
    accountNumber: '',
    ifsc: '',
  });
  readonly areas = signal<{ label: string; value: string }[]>([]);
  readonly problems = signal<string[]>([]);
  readonly saved = signal<string | null>(null);
  /** Rider agreement + privacy policy accepted (or nothing published yet). */
  readonly legalDone = signal(false);

  readonly meta = STATUS_META;
  readonly vehicles = VEHICLES;
  readonly genderOptions = [
    { label: 'Male', value: 'male' },
    { label: 'Female', value: 'female' },
    { label: 'Other', value: 'other' },
  ];
  readonly payoutOptions = [
    { label: 'UPI', value: 'upi' },
    { label: 'Bank account', value: 'bank' },
  ];
  readonly docs = computed(() =>
    DOCS.filter((d) => !d.motorOnly || isMotor(this.form().vehicleType)),
  );
  readonly motor = computed(() => isMotor(this.form().vehicleType));
  readonly showForm = computed(() => {
    const r = this.rider();
    return r === null || r?.status === 'draft' || this.editing();
  });
  readonly maxDob = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 18);
    return d.toISOString().slice(0, 10);
  })();

  constructor() {
    // After sign-in has settled (a stale saved login can fail the first
    // request), and again whenever the user changes.
    effect(() => {
      if (!this.ready()) return;
      this.session();
      void this.api.phoneOtpOn().then((on) => this.otpOn.set(on));
      void this.api
        .activeAreas()
        .then((a) => this.areas.set(a))
        .catch(() => this.error.set('Couldn’t load the delivery areas. Refresh the page.'));
    });
    let stop: (() => void) | null = null;
    effect(() => {
      const s = this.session();
      stop?.();
      this.rider.set(undefined);
      if (!s) return;
      let first = true;
      stop = this.api.listenMine(
        s.uid,
        (r) => {
          this.rider.set(r);
          if (first) {
            first = false;
            this.fill(r, s.phoneNumber);
          }
        },
        () => this.rider.set(null),
      );
    });
    inject(DestroyRef).onDestroy(() => stop?.());
  }

  private async fill(r: Rider | null, phone: string | null): Promise<void> {
    const p = (phone ?? '').replace(/^\+91/, '');
    if (!r) {
      this.form.set({ ...EMPTY, phone: p, fullName: this.session()?.displayName ?? '' });
      return;
    }
    this.form.set({
      fullName: r.fullName,
      phone: r.phone.replace(/^\+91/, '') || p,
      dob: r.dob,
      gender: r.gender,
      address: r.address,
      serviceAreaId: r.serviceAreaId,
      vehicleType: r.vehicleType,
      vehicleNumber: r.vehicleNumber,
      drivingLicenceNumber: r.drivingLicenceNumber,
      docs: { ...r.docs },
    });
    const saved = await this.api.payout(this.session()!.uid);
    // Stored docs may lack the other method's fields.
    const blank: PayoutInput = {
      method: 'upi',
      upiId: '',
      accountName: '',
      accountNumber: '',
      ifsc: '',
    };
    if (saved) this.payout.set({ ...blank, ...(saved as Partial<PayoutInput>) });
  }

  patch(p: Partial<Form>): void {
    this.form.update((f) => ({ ...f, ...p }));
  }

  patchPayout(p: Partial<PayoutInput>): void {
    this.payout.update((x) => ({ ...x, ...p }));
  }

  setDoc(key: DocKey, path: string): void {
    this.form.update((f) => ({ ...f, docs: { ...f.docs, [key]: path } }));
  }

  // ---- Sign-in ----------------------------------------------------------------

  async sendCode(): Promise<void> {
    const p = this.phone10().replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(p)) {
      this.error.set('Enter your 10-digit mobile number.');
      return;
    }
    await this.run(async () => {
      await this.riderAuth.sendOtp(p, 'otp-send');
      this.codeSent.set(true);
    });
  }

  async verify(): Promise<void> {
    if (!/^\d{6}$/.test(this.code())) {
      this.error.set('Enter the 6-digit code.');
      return;
    }
    await this.run(() => this.riderAuth.confirmOtp(this.code()));
  }

  async google(): Promise<void> {
    await this.run(() => this.riderAuth.google());
  }

  signOut(): void {
    void this.auth.signOut();
    this.codeSent.set(false);
    this.code.set('');
    this.editing.set(false);
    this.step.set(0);
  }

  private async run(task: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await task();
    } catch (e) {
      this.error.set(riderAuthError(e));
    } finally {
      this.busy.set(false);
    }
  }

  // ---- Application ---------------------------------------------------------------

  private payload(): Record<string, unknown> {
    const f = this.form();
    const p = this.payout();
    return {
      ...f,
      phone: f.phone.replace(/\D/g, ''),
      vehicleNumber: f.vehicleNumber.toUpperCase(),
      drivingLicenceNumber: f.drivingLicenceNumber.toUpperCase(),
      payout:
        p.method === 'upi'
          ? { method: 'upi', upiId: p.upiId.trim() }
          : {
              method: 'bank',
              accountName: p.accountName.trim(),
              accountNumber: p.accountNumber.replace(/\s/g, ''),
              ifsc: p.ifsc.toUpperCase().trim(),
            },
    };
  }

  private check(step: number): boolean {
    const problems = stepProblems({ ...this.form(), payoutInput: this.payout() }, step);
    this.problems.set(problems);
    return problems.length === 0;
  }

  async next(): Promise<void> {
    if (!this.check(this.step())) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      // Save as we go, so nothing is lost if the phone dies.
      await this.api.save(this.payload(), false);
      this.saved.set('Saved');
      this.step.update((s) => s + 1);
      window.scrollTo({ top: 0 });
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  back(): void {
    this.problems.set([]);
    this.step.update((s) => Math.max(0, s - 1));
  }

  async submit(): Promise<void> {
    if (!this.legalDone()) {
      this.problems.set(['Read and sign the rider agreement first.']);
      return;
    }
    for (const s of [0, 1, 2, 3]) {
      if (!this.check(s)) {
        this.step.set(s);
        return;
      }
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.save(this.payload(), true);
      this.editing.set(false);
      this.step.set(0);
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  edit(): void {
    this.editing.set(true);
    this.step.set(0);
    this.problems.set([]);
  }

  areaName(id: string): string {
    return this.areas().find((a) => a.value === id)?.label ?? '';
  }
}
