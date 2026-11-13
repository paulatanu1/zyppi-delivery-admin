import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { allReady } from '../../core/firebase/live';
import { Confirm } from '../../shared/ui/confirm';
import { PageHeader } from '../../shared/ui/page-header';
import { PageState } from '../../shared/ui/page-state';
import { CatalogApi } from '../catalog/catalog.api';
import { Category, argbToCss, cssToArgb } from '../catalog/catalog.models';
import { ImagePicker } from '../catalog/image-picker';

interface Draft {
  id: string | null;
  name: string;
  parentId: string | null;
  imageUrl: string | null;
  tile: string;
  border: string;
}

/** Catalog → Categories: top level on the left, its sub-categories on the right. */
@Component({
  selector: 'z-categories-page',
  imports: [
    FormsModule,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    NzAlertModule,
    NzButtonModule,
    NzIconModule,
    NzInputModule,
    NzModalModule,
    NzSelectModule,
    PageHeader,
    PageState,
    ImagePicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './categories-page.html',
  styleUrl: './categories-page.scss',
})
export class CategoriesPage {
  private readonly api = inject(CatalogApi);
  private readonly confirm = inject(Confirm);
  private readonly toast = inject(NzMessageService);

  readonly categories = this.api.watchCategories();
  readonly products = this.api.watchProducts();
  readonly status = allReady(this.categories, this.products);

  readonly selectedId = signal<string | null>(null);
  /** Local order while a reorder is saving, so the drop doesn't jump back. */
  private readonly pendingOrder = signal<Record<string, string[]>>({});

  readonly draft = signal<Draft | null>(null);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly top = computed(() => this.ordered(null));
  readonly selected = computed(() => {
    const id = this.selectedId() ?? this.top()[0]?.id ?? null;
    return this.top().find((c) => c.id === id) ?? null;
  });
  readonly subs = computed(() => {
    const s = this.selected();
    return s ? this.ordered(s.id) : [];
  });
  readonly productCount = computed(() => {
    const counts = new Map<string, number>();
    for (const p of this.products.value() ?? []) {
      counts.set(p.categoryId, (counts.get(p.categoryId) ?? 0) + 1);
      if (p.subcategoryId) counts.set(p.subcategoryId, (counts.get(p.subcategoryId) ?? 0) + 1);
    }
    return counts;
  });
  readonly parentOptions = computed(() => [
    { label: 'None (top-level category)', value: null },
    ...this.top()
      .filter((c) => c.id !== this.draft()?.id)
      .map((c) => ({ label: c.name, value: c.id })),
  ]);
  readonly hasChildren = computed(() => {
    const id = this.draft()?.id;
    return !!id && (this.categories.value() ?? []).some((c) => c.parentId === id);
  });

  private ordered(parentId: string | null): Category[] {
    const list = (this.categories.value() ?? []).filter((c) => c.parentId === parentId);
    const pending = this.pendingOrder()[parentId ?? ''];
    if (!pending) return list;
    const byId = new Map(list.map((c) => [c.id, c]));
    return pending.map((id) => byId.get(id)).filter((c): c is Category => !!c);
  }

  count(id: string): number {
    return this.productCount().get(id) ?? 0;
  }

  swatch(c: Category): string {
    return argbToCss(c.colorHex);
  }

  async drop(e: CdkDragDrop<Category[]>, parentId: string | null): Promise<void> {
    if (e.previousIndex === e.currentIndex) return;
    const ids = (parentId ? this.subs() : this.top()).map((c) => c.id);
    moveItemInArray(ids, e.previousIndex, e.currentIndex);
    const key = parentId ?? '';
    this.pendingOrder.update((p) => ({ ...p, [key]: ids }));
    try {
      await this.api.reorderCategories(parentId, ids);
      this.toast.success('Order saved');
    } catch (err) {
      this.toast.error(`Order not saved: ${(err as Error).message}`);
    } finally {
      this.pendingOrder.update((p) => {
        const next = { ...p };
        delete next[key];
        return next;
      });
    }
  }

  openNew(parentId: string | null): void {
    this.error.set(null);
    this.draft.set({
      id: null,
      name: '',
      parentId,
      imageUrl: null,
      tile: '#ede7f6',
      border: '#d1c4e9',
    });
  }

  openEdit(c: Category): void {
    this.error.set(null);
    this.draft.set({
      id: c.id,
      name: c.name,
      parentId: c.parentId,
      imageUrl: c.imageUrl,
      tile: argbToCss(c.colorHex),
      border: argbToCss(c.borderColorHex),
    });
  }

  patch(p: Partial<Draft>): void {
    this.draft.update((d) => (d ? { ...d, ...p } : d));
  }

  async save(): Promise<void> {
    const d = this.draft();
    if (!d || d.name.trim().length < 2) {
      this.error.set('Enter a name (2+ characters).');
      return;
    }
    const original = d.id ? (this.categories.value() ?? []).find((c) => c.id === d.id) : null;
    this.saving.set(true);
    this.error.set(null);
    try {
      const { id } = await this.api.saveCategory({
        ...(d.id ? { id: d.id } : {}),
        name: d.name.trim(),
        parentId: d.parentId,
        imageUrl: d.imageUrl,
        // Keep the stored alpha (the seed uses translucent tiles).
        colorHex: cssToArgb(d.tile, original?.colorHex?.slice(0, 2) ?? 'FF'),
        borderColorHex: cssToArgb(d.border, original?.borderColorHex?.slice(0, 2) ?? 'FF'),
      });
      this.toast.success(d.id ? 'Category saved' : 'Category added');
      if (!d.parentId) this.selectedId.set(id);
      this.draft.set(null);
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  async remove(): Promise<void> {
    const d = this.draft();
    if (!d?.id) return;
    const ok = await this.confirm.ask({
      title: `Delete “${d.name}”?`,
      content: 'Only empty categories can be deleted. This can’t be undone.',
      okText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    this.saving.set(true);
    try {
      await this.api.deleteCategory(d.id);
      this.toast.success('Category deleted');
      if (this.selectedId() === d.id) this.selectedId.set(null);
      this.draft.set(null);
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  retry(): void {
    this.categories.retry();
    this.products.retry();
  }
}
