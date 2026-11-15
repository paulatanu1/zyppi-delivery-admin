import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { RidersApi } from '../riders/riders.api';
import { DocKey } from '../riders/riders.models';

const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

/** One KYC document: take a photo / choose a file → private upload → path. */
@Component({
  selector: 'z-kyc-upload',
  imports: [NzIconModule, NzSpinModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="slot" [class.done]="!!path()" [class.err]="!!error()">
      <input
        type="file"
        class="sr-only"
        [accept]="accept"
        [attr.capture]="key() === 'selfie' ? 'user' : 'environment'"
        (change)="pick($event)"
      />
      <span class="thumb">
        @if (busy()) {
          <nz-spin nzSimple />
        } @else if (preview()) {
          <img [src]="preview()" alt="" />
        } @else if (path()) {
          <span nz-icon nzType="check-circle" class="text-[24px] text-[var(--z-ok)]"></span>
        } @else {
          <span nz-icon nzType="upload" class="text-[22px]"></span>
        }
      </span>
      <span class="flex-1 min-w-0">
        <span class="block font-bold">{{ label() }}</span>
        <span class="block z-caption">{{
          error() || (path() ? 'Uploaded · tap to replace' : hint())
        }}</span>
      </span>
    </label>
  `,
  styles: `
    .slot {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px;
      border: 1.5px dashed var(--z-line-2);
      border-radius: var(--z-radius-tile);
      background: var(--z-surface);
      cursor: pointer;
    }
    .slot:focus-within,
    .slot:hover {
      border-color: var(--z-brand);
    }
    .slot.done {
      border-style: solid;
      border-color: var(--z-ok);
    }
    .slot.err {
      border-color: var(--z-danger);
    }
    .thumb {
      display: grid;
      place-items: center;
      flex: none;
      width: 56px;
      height: 56px;
      border-radius: 12px;
      overflow: hidden;
      background: var(--z-surface-2);
      color: var(--z-ink-3);
    }
    .thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  `,
})
export class KycUpload {
  private readonly api = inject(RidersApi);
  readonly uid = input.required<string>();
  readonly key = input.required<DocKey>();
  readonly label = input('');
  readonly hint = input('');
  readonly path = input<string | null | undefined>(null);
  readonly uploaded = output<string>();
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly preview = signal<string | null>(null);
  protected readonly accept = TYPES.join(',');

  constructor() {
    // Show the stored file when coming back to the form.
    effect(() => {
      const p = this.path();
      if (p && !this.preview() && !p.endsWith('.pdf')) {
        this.api
          .docUrl(p)
          .then((u) => this.preview.set(u))
          .catch(() => undefined);
      }
    });
  }

  async pick(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.error.set(null);
    if (!TYPES.includes(file.type) && !file.type.startsWith('image/')) {
      this.error.set('Use a photo or a PDF.');
      return;
    }
    this.busy.set(true);
    try {
      const path = await this.api.uploadKyc(this.uid(), this.key(), file);
      this.preview.set(file.type === 'application/pdf' ? null : URL.createObjectURL(file));
      this.uploaded.emit(path);
    } catch (err) {
      this.error.set(
        (err as Error).message?.includes('5 MB')
          ? 'PDF is over 5 MB.'
          : 'Upload failed. Try again.',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
