import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { doc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { RiderAuthService, riderAuthError } from '../../core/auth/rider-auth.service';
import { Callables } from '../../core/firebase/callable';
import { FIREBASE_AUTH, FIRESTORE, STORAGE } from '../../core/firebase/firebase';
import { legalMarkdownToHtml } from '../../shared/legal/legal-markdown';

interface PendingDoc {
  type: string;
  version: number;
  title: string;
  sha256: string;
  signed: boolean;
  html: string;
}

/** The server accepts a signature only this soon after a sign-in or re-confirm (legal/model.ts). */
const CONFIRM_MAX_AGE_MS = 10 * 60_000;

/**
 * Reads, accepts and signs the documents a rider still has to accept
 * (functions/src/legal: legalStatus → acceptLegal). Signed agreements need
 * a drawn signature (uploaded to riders/{uid}/kyc/) and a fresh password or Google re-confirm in
 * the last 10 minutes; the server re-checks both. Emits `done` once
 * nothing is pending (straight away if nothing is published yet).
 */
@Component({
  selector: 'z-legal-sign',
  imports: [
    FormsModule,
    NzAlertModule,
    NzButtonModule,
    NzCheckboxModule,
    NzInputModule,
    NzSpinModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <div class="py-6 text-center"><nz-spin nzSimple /></div>
    } @else if (docs().length === 0) {
      <p class="z-caption">{{ doneText() }}</p>
    } @else {
      <div class="flex flex-col gap-4">
        @for (d of docs(); track d.type) {
          <article class="legal-doc" tabindex="0" (scroll)="onScroll($event, d.type)">
            <h3 class="m-0">{{ d.title }}</h3>
            <div class="legal-body" [innerHTML]="d.html"></div>
          </article>
        }
        @if (!allRead()) {
          <p class="z-caption">Scroll to the end of each document to continue.</p>
        }
        <div nz-checkbox [(ngModel)]="agreed" [nzDisabled]="!allRead()">
          I have read and agree to {{ titles() }}.
        </div>

        @if (needsSignature()) {
          <div>
            <div class="flex items-center justify-between">
              <span class="font-medium">Your signature</span>
              <button nz-button nzType="link" (click)="clear()">Clear</button>
            </div>
            <canvas
              #pad
              class="signature-pad"
              width="600"
              height="200"
              aria-label="Signature pad: draw your signature"
              (pointerdown)="start($event)"
              (pointermove)="move($event)"
              (pointerup)="end()"
              (pointerleave)="end()"
            ></canvas>
          </div>

          @if (confirmNeeded()) {
            <div class="flex flex-col gap-2">
              @if (usesPassword()) {
                <span class="z-caption">Confirm it's you: enter your password.</span>
                <div class="flex gap-2">
                  <input
                    nz-input
                    type="password"
                    autocomplete="current-password"
                    aria-label="Password"
                    [(ngModel)]="password"
                  />
                  <button nz-button [nzLoading]="busy()" (click)="reconfirm()">Confirm</button>
                </div>
              } @else {
                <span class="z-caption">Confirm it's you with your Google account.</span>
                <button nz-button [nzLoading]="busy()" (click)="reconfirm()">
                  Confirm with Google
                </button>
              }
            </div>
          }
        }

        @if (error(); as e) {
          <nz-alert nzType="error" nzShowIcon [nzMessage]="e" />
        }
        <button
          nz-button
          nzType="primary"
          [disabled]="!canSign()"
          [nzLoading]="busy()"
          (click)="sign()"
        >
          {{ needsSignature() ? 'Sign and accept' : 'Accept' }}
        </button>
      </div>
    }
  `,
  styles: `
    .legal-doc {
      max-height: 320px;
      overflow-y: auto;
      padding: 12px 16px;
      border: 1px solid var(--z-line, #e5e5e5);
      border-radius: 12px;
      background: var(--z-surface, transparent);
    }
    .legal-body :is(h2, h3, h4, h5) {
      margin: 12px 0 4px;
      font-size: 1rem;
    }
    .signature-pad {
      width: 100%;
      height: 160px;
      touch-action: none;
      border: 1px dashed var(--z-line, #c8c8c8);
      border-radius: 12px;
      background: #fff;
      cursor: crosshair;
    }
  `,
})
export class LegalSign implements AfterViewChecked {
  private readonly callables = inject(Callables);
  private readonly db = inject(FIRESTORE);
  private readonly storage = inject(STORAGE);
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly riderAuth = inject(RiderAuthService);

  readonly audience = input<'rider' | 'seller'>('rider');
  readonly done = output<void>();

  readonly loading = signal(true);
  readonly docs = signal<PendingDoc[]>([]);
  readonly read = signal<Set<string>>(new Set());
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly confirmedAt = signal<number | null>(null);
  readonly hasInk = signal(false);
  readonly doneText = signal('Nothing to sign right now.');
  agreed = false;
  password = '';

  private readonly pad = viewChild<ElementRef<HTMLCanvasElement>>('pad');
  private drawing = false;

  readonly allRead = computed(() => this.docs().every((d) => this.read().has(d.type)));
  readonly needsSignature = computed(() => this.docs().some((d) => d.signed));
  readonly titles = computed(() =>
    this.docs()
      .map((d) => d.title)
      .join(' and '),
  );
  readonly usesPassword = signal(this.riderAuth.usesPassword());
  readonly confirmNeeded = computed(() => {
    const at = this.confirmedAt();
    return at === null || Date.now() - at > CONFIRM_MAX_AGE_MS - 30_000;
  });

  canSign(): boolean {
    if (!this.agreed || !this.allRead() || this.busy()) return false;
    if (!this.needsSignature()) return true;
    return this.hasInk() && !this.confirmNeeded();
  }

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      await this.refreshAuthTime();
      const res = await this.callables.call<unknown, { pending: Omit<PendingDoc, 'html'>[] }>(
        'legalStatus',
        { audience: this.audience() },
      );
      const docs = await Promise.all(
        res.pending.map(async (d) => {
          const v = await getDoc(doc(this.db, 'legalDocs', d.type, 'versions', String(d.version)));
          const body = (v.get('body') ?? {}) as Record<string, string>;
          return { ...d, html: legalMarkdownToHtml(body['en'] ?? '') };
        }),
      );
      this.docs.set(docs);
      if (!docs.length) this.done.emit();
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  /** The ID token's auth_time: when the rider last signed in or re-confirmed. */
  private async refreshAuthTime(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) return;
    const t = await user.getIdTokenResult(true);
    this.confirmedAt.set(Date.parse(t.authTime));
  }

  onScroll(e: Event, type: string): void {
    const el = e.target as HTMLElement;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
      this.read.update((s) => new Set(s).add(type));
    }
  }

  /** Short documents that don't scroll count as read once shown. */
  ngAfterViewChecked(): void {
    const unread = this.docs().filter((d) => !this.read().has(d.type));
    if (!unread.length) return;
    const els = document.querySelectorAll<HTMLElement>('z-legal-sign .legal-doc');
    els.forEach((el, i) => {
      const d = this.docs()[i];
      if (d && !this.read().has(d.type) && el.scrollHeight <= el.clientHeight + 24) {
        queueMicrotask(() => this.read.update((s) => new Set(s).add(d.type)));
      }
    });
  }

  // ---- Signature pad -------------------------------------------------------------

  private ctx(): CanvasRenderingContext2D | null {
    return this.pad()?.nativeElement.getContext('2d') ?? null;
  }

  private point(e: PointerEvent): [number, number] {
    const c = this.pad()!.nativeElement;
    const r = c.getBoundingClientRect();
    return [
      ((e.clientX - r.left) * c.width) / r.width,
      ((e.clientY - r.top) * c.height) / r.height,
    ];
  }

  start(e: PointerEvent): void {
    const ctx = this.ctx();
    if (!ctx) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    this.drawing = true;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111';
    ctx.beginPath();
    ctx.moveTo(...this.point(e));
  }

  move(e: PointerEvent): void {
    if (!this.drawing) return;
    const ctx = this.ctx()!;
    ctx.lineTo(...this.point(e));
    ctx.stroke();
    this.hasInk.set(true);
  }

  end(): void {
    this.drawing = false;
  }

  clear(): void {
    const c = this.pad()?.nativeElement;
    c?.getContext('2d')?.clearRect(0, 0, c.width, c.height);
    this.hasInk.set(false);
  }

  // ---- Re-confirm ----------------------------------------------------------------

  /** Password or Google again: refreshes auth_time so the signature counts. */
  async reconfirm(): Promise<void> {
    await this.run(async () => {
      await this.riderAuth.reconfirm(this.password);
      this.password = '';
      await this.refreshAuthTime();
    });
  }

  // ---- Accept --------------------------------------------------------------------

  async sign(): Promise<void> {
    const uid = this.auth.currentUser?.uid;
    if (!uid || !this.canSign()) return;
    await this.run(async () => {
      let signaturePath: string | null = null;
      if (this.needsSignature()) {
        const blob = await new Promise<Blob | null>((r) =>
          this.pad()!.nativeElement.toBlob(r, 'image/png'),
        );
        if (!blob) throw new Error('Draw your signature again.');
        signaturePath = `${this.audience()}s/${uid}/kyc/signature_${Date.now()}.png`;
        await uploadBytes(ref(this.storage, signaturePath), blob, { contentType: 'image/png' });
      }
      await this.callables.call('acceptLegal', {
        audience: this.audience(),
        items: this.docs().map((d) => ({ type: d.type, version: d.version, sha256: d.sha256 })),
        signaturePath,
        appId: 'rider-portal',
        appVersion: 'web',
        platform: 'web',
      });
      this.docs.set([]);
      this.doneText.set('Signed. Thank you!');
      this.done.emit();
    });
  }

  private async run(task: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await task();
    } catch (e) {
      const msg = (e as Error).message ?? '';
      if (msg.includes('OTP_REQUIRED')) {
        this.confirmedAt.set(null);
        this.error.set('Confirm it’s you again, then sign.');
      } else if (msg.includes('TERMS_CHANGED')) {
        this.error.set('The terms were just updated. Please read them again.');
        void this.load();
      } else {
        const code = (e as { code?: string }).code ?? '';
        this.error.set(code.startsWith('auth/') ? riderAuthError(e) : msg);
      }
    } finally {
      this.busy.set(false);
    }
  }
}
