import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { RupeesPipe } from '../../shared/pipes/rupees.pipe';
import { CatalogApi } from '../catalog/catalog.api';
import { Category, Product, discountPercent } from '../catalog/catalog.models';
import { ImagePicker } from '../catalog/image-picker';

interface VariantDraft {
  id: string | null;
  label: string;
  /** Rupees as typed (nz-input-number), converted to paise on save. */
  price: number | null;
  mrp: number | null;
}

const blankVariant = (): VariantDraft => ({ id: null, label: '', price: null, mrp: null });

/** Create / edit one product in a side drawer (full width on phones). */
@Component({
  selector: 'z-product-editor',
  imports: [
    FormsModule,
    NzAlertModule,
    NzButtonModule,
    NzDrawerModule,
    NzIconModule,
    NzInputModule,
    NzInputNumberModule,
    NzSelectModule,
    NzSwitchModule,
    RupeesPipe,
    ImagePicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-editor.html',
  styles: `
    .variant {
      display: grid;
      grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1fr) auto;
      gap: 8px;
      align-items: start;
    }
    @media (max-width: 520px) {
      .variant {
        grid-template-columns: 1fr 1fr auto;
      }
      .variant .label {
        grid-column: 1 / -1;
      }
    }
  `,
})
export class ProductEditor {
  private readonly api = inject(CatalogApi);
  private readonly toast = inject(NzMessageService);

  /** null = closed; 'new' = create; a product = edit. */
  readonly product = input<Product | 'new' | null>(null);
  readonly categories = input<Category[]>([]);
  readonly closed = output<void>();

  readonly name = signal('');
  readonly description = signal('');
  readonly categoryId = signal<string | null>(null);
  readonly subcategoryId = signal<string | null>(null);
  readonly imageUrl = signal<string | null>(null);
  readonly isActive = signal(true);
  readonly variants = signal<VariantDraft[]>([blankVariant()]);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly submitted = signal(false);

  readonly open = computed(() => this.product() !== null);
  readonly isNew = computed(() => this.product() === 'new');
  readonly width = computed(() => (globalThis.innerWidth < 720 ? '100%' : 640));
  readonly topOptions = computed(() =>
    this.categories()
      .filter((c) => !c.parentId)
      .map((c) => ({ label: c.name, value: c.id })),
  );
  readonly subOptions = computed(() =>
    this.categories()
      .filter((c) => c.parentId && c.parentId === this.categoryId())
      .map((c) => ({ label: c.name, value: c.id })),
  );

  /** Client-side mirror of the server checks, shown inline. */
  readonly problems = computed(() => {
    const out: string[] = [];
    const n = this.name().trim();
    if (n.length < 2) out.push('Enter a product name.');
    if (!this.categoryId()) out.push('Pick a category.');
    const labels = new Set<string>();
    this.variants().forEach((v, i) => {
      const k = `Variant ${i + 1}`;
      if (!v.label.trim()) out.push(`${k}: add the size, e.g. “500 g”.`);
      else if (labels.has(v.label.trim().toLowerCase())) out.push(`${k}: size listed twice.`);
      labels.add(v.label.trim().toLowerCase());
      if (!v.price || v.price <= 0) out.push(`${k}: enter the selling price.`);
      if (v.mrp != null && v.price != null && v.mrp < v.price) {
        out.push(`${k}: MRP can’t be below the selling price.`);
      }
    });
    return out;
  });

  constructor() {
    effect(() => {
      const p = this.product();
      this.error.set(null);
      this.submitted.set(false);
      if (p === 'new') {
        this.name.set('');
        this.description.set('');
        this.categoryId.set(null);
        this.subcategoryId.set(null);
        this.imageUrl.set(null);
        this.isActive.set(true);
        this.variants.set([blankVariant()]);
      } else if (p) {
        this.name.set(p.name);
        this.description.set(p.description);
        this.categoryId.set(p.categoryId || null);
        this.subcategoryId.set(p.subcategoryId);
        this.imageUrl.set(p.imageUrl);
        this.isActive.set(p.isActive);
        this.variants.set(
          p.variants.length
            ? p.variants.map((v) => ({
                id: v.id,
                label: v.label,
                price: v.pricePaise / 100,
                mrp: v.mrpPaise / 100,
              }))
            : [blankVariant()],
        );
      }
    });
  }

  setCategory(id: string | null): void {
    this.categoryId.set(id);
    this.subcategoryId.set(null);
  }

  patchVariant(i: number, patch: Partial<VariantDraft>): void {
    this.variants.update((list) => list.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  }

  addVariant(): void {
    this.variants.update((list) => [...list, blankVariant()]);
  }

  removeVariant(i: number): void {
    this.variants.update((list) => list.filter((_, j) => j !== i));
  }

  discount(v: VariantDraft): number {
    return v.price && v.mrp ? discountPercent(v.price * 100, v.mrp * 100) : 0;
  }

  async save(): Promise<void> {
    this.submitted.set(true);
    if (this.problems().length) return;
    const p = this.product();
    this.saving.set(true);
    this.error.set(null);
    try {
      const res = await this.api.saveProduct({
        ...(p && p !== 'new' ? { id: p.id } : {}),
        name: this.name().trim(),
        description: this.description().trim(),
        categoryId: this.categoryId()!,
        subcategoryId: this.subcategoryId(),
        imageUrl: this.imageUrl(),
        isActive: this.isActive(),
        variants: this.variants().map((v) => ({
          ...(v.id ? { id: v.id } : {}),
          label: v.label.trim(),
          pricePaise: Math.round((v.price ?? 0) * 100),
          mrpPaise: Math.round((v.mrp ?? v.price ?? 0) * 100),
        })),
      });
      this.toast.success(res.created ? 'Product created' : 'Product saved');
      this.closed.emit();
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.saving.set(false);
    }
  }
}
