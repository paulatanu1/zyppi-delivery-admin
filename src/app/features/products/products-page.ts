import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSegmentedModule } from 'ng-zorro-antd/segmented';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { allReady } from '../../core/firebase/live';
import { RupeesPipe } from '../../shared/pipes/rupees.pipe';
import { WhenPipe } from '../../shared/pipes/when.pipe';
import { PageHeader } from '../../shared/ui/page-header';
import { PageState } from '../../shared/ui/page-state';
import { CatalogApi } from '../catalog/catalog.api';
import { Category, Product, categoryPath } from '../catalog/catalog.models';
import { ProductEditor } from './product-editor';

type StatusFilter = 'all' | 'active' | 'hidden';

@Component({
  selector: 'z-products-page',
  imports: [
    FormsModule,
    RouterLink,
    NzButtonModule,
    NzIconModule,
    NzInputModule,
    NzSegmentedModule,
    NzSelectModule,
    NzTableModule,
    NzTagModule,
    RupeesPipe,
    WhenPipe,
    PageHeader,
    PageState,
    ProductEditor,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './products-page.html',
  styles: `
    .thumb {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      object-fit: contain;
      background: var(--z-surface-2);
      flex: none;
    }
    .thumb.empty {
      display: grid;
      place-items: center;
      color: var(--z-ink-3);
    }
    tr.row {
      cursor: pointer;
    }
  `,
})
export class ProductsPage {
  private readonly api = inject(CatalogApi);

  readonly products = this.api.watchProducts();
  readonly categories = this.api.watchCategories();
  readonly status = allReady(this.products, this.categories);

  readonly search = signal('');
  readonly categoryFilter = signal<string | null>(null);
  readonly statusFilter = signal<StatusFilter>('all');
  readonly editing = signal<Product | 'new' | null>(null);

  readonly catMap = computed(
    () => new Map((this.categories.value() ?? []).map((c) => [c.id, c] as [string, Category])),
  );
  /** Top-level categories plus their sub-categories, for the filter. */
  readonly categoryOptions = computed(() => {
    const cats = this.categories.value() ?? [];
    return cats
      .filter((c) => !c.parentId)
      .flatMap((top) => [
        { label: top.name, value: top.id },
        ...cats
          .filter((c) => c.parentId === top.id)
          .map((s) => ({ label: `${top.name} › ${s.name}`, value: s.id })),
      ]);
  });

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const cat = this.categoryFilter();
    const st = this.statusFilter();
    return (this.products.value() ?? []).filter(
      (p) =>
        (!q || p.name.toLowerCase().includes(q) || p.id === q) &&
        (!cat || p.categoryId === cat || p.subcategoryId === cat) &&
        (st === 'all' || (st === 'active') === p.isActive),
    );
  });

  readonly counts = computed(() => {
    const all = this.products.value() ?? [];
    const hidden = all.filter((p) => !p.isActive).length;
    return { all: all.length, active: all.length - hidden, hidden };
  });

  readonly statusOptions = computed(() => [
    { label: `All ${this.counts().all}`, value: 'all' },
    { label: `In app ${this.counts().active}`, value: 'active' },
    { label: `Hidden ${this.counts().hidden}`, value: 'hidden' },
  ]);

  path(p: Product): string {
    return categoryPath(this.catMap(), p.categoryId, p.subcategoryId);
  }

  priceRange(p: Product): [number, number] | null {
    if (!p.variants.length) return null;
    const prices = p.variants.map((v) => v.pricePaise);
    return [Math.min(...prices), Math.max(...prices)];
  }

  retry(): void {
    this.products.retry();
    this.categories.retry();
  }
}
