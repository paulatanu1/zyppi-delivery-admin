import { ChangeDetectionStrategy, Component, inject, input, model, signal } from '@angular/core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from '../../shared/util/image';
import { CatalogApi } from './catalog.api';

/** Square image slot: click or drop a photo → compressed WebP upload → URL. */
@Component({
  selector: 'z-image-picker',
  imports: [NzButtonModule, NzIconModule, NzSpinModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center gap-4">
      <label
        class="slot"
        [class.drag]="dragging()"
        (dragover)="$event.preventDefault(); dragging.set(true)"
        (dragleave)="dragging.set(false)"
        (drop)="onDrop($event)"
      >
        <input type="file" class="sr-only" [accept]="types" (change)="onPick($event)" />
        @if (busy()) {
          <nz-spin nzSimple />
        } @else if (url()) {
          <img [src]="url()" alt="" />
        } @else {
          <span class="flex flex-col items-center gap-1 z-caption text-center px-2">
            <span nz-icon nzType="picture" class="text-[22px]"></span>Add photo
          </span>
        }
      </label>
      <div class="flex flex-col gap-2 min-w-0">
        <span class="z-caption">{{ hint() }}</span>
        @if (error(); as e) {
          <span class="text-[12px] text-[var(--z-danger)]">{{ e }}</span>
        }
        @if (url() && !busy()) {
          <button
            nz-button
            nzSize="small"
            nzDanger
            nzType="text"
            class="self-start"
            (click)="url.set(null)"
          >
            Remove photo
          </button>
        }
      </div>
    </div>
  `,
  styles: `
    .slot {
      display: grid;
      place-items: center;
      flex: none;
      width: 112px;
      height: 112px;
      border-radius: var(--z-radius-tile);
      border: 1.5px dashed var(--z-line-2);
      background: var(--z-surface-2);
      overflow: hidden;
      cursor: pointer;
      transition: border-color 0.15s;
    }
    .slot:hover,
    .slot.drag,
    .slot:focus-within {
      border-color: var(--z-brand);
    }
    img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: var(--z-surface);
    }
  `,
})
export class ImagePicker {
  private readonly api = inject(CatalogApi);
  readonly url = model<string | null>(null);
  readonly folder = input<'products' | 'categories'>('products');
  readonly hint = input('Square photo on a plain background works best. JPG, PNG or WebP.');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly dragging = signal(false);
  protected readonly types = IMAGE_TYPES.join(',');

  onPick(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) void this.upload(file);
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.dragging.set(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) void this.upload(file);
  }

  private async upload(file: File): Promise<void> {
    this.error.set(null);
    if (!IMAGE_TYPES.includes(file.type)) {
      this.error.set('Use a JPG, PNG or WebP image.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      this.error.set('That file is over 15 MB.');
      return;
    }
    this.busy.set(true);
    try {
      this.url.set(await this.api.uploadImage(file, this.folder()));
    } catch {
      this.error.set('Upload failed. Check your connection and try again.');
    } finally {
      this.busy.set(false);
    }
  }
}
