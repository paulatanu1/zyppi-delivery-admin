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
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzSegmentedModule } from 'ng-zorro-antd/segmented';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { LoadStatus, allReady, friendlyFirestoreError } from '../../core/firebase/live';
import { WhenPipe } from '../../shared/pipes/when.pipe';
import { PageHeader } from '../../shared/ui/page-header';
import { PageState } from '../../shared/ui/page-state';
import {
  CatalogApi,
  Movement,
  STOCK_REASONS,
  StockChange,
  StockReason,
} from '../catalog/catalog.api';
import { LOW_STOCK, StockRow } from '../catalog/catalog.models';
import { shortOrderId } from '../orders/orders.models';

interface Line {
  productId: string;
  variantId: string;
  name: string;
  size: string;
  imageUrl: string | null;
  isActive: boolean;
  quantity: number;
}

type AdjustMode = 'add' | 'remove' | 'set';

@Component({
  selector: 'z-inventory-page',
  imports: [
    FormsModule,
    NzAlertModule,
    NzButtonModule,
    NzDrawerModule,
    NzIconModule,
    NzInputModule,
    NzInputNumberModule,
    NzModalModule,
    NzSegmentedModule,
    NzSelectModule,
    NzSwitchModule,
    NzTableModule,
    NzTagModule,
    WhenPipe,
    PageHeader,
    PageState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './inventory-page.html',
  styles: `
    .thumb {
      width: 36px;
      height: 36px;
      border-radius: 9px;
      object-fit: contain;
      background: var(--z-surface-2);
      flex: none;
    }
    .qty {
      font-family: var(--font-display);
      font-size: 16px;
    }
  `,
})
export class InventoryPage {
  private readonly api = inject(CatalogApi);
  private readonly toast = inject(NzMessageService);

  readonly stores = this.api.watchStores();
  readonly products = this.api.watchProducts();
  readonly baseStatus = allReady(this.stores, this.products);

  readonly storeId = signal<string | null>(null);
  readonly stock = signal<StockRow[] | null>(null);
  readonly stockError = signal<string | null>(null);
  readonly search = signal('');
  readonly lowOnly = signal(false);
  readonly low = LOW_STOCK;

  // Adjust modal
  readonly adjusting = signal<Line | null>(null);
  readonly mode = signal<AdjustMode>('add');
  readonly amount = signal<number | null>(null);
  readonly reason = signal<StockReason>('restock');
  readonly note = signal('');
  readonly saving = signal(false);
  readonly adjustError = signal<string | null>(null);
  readonly reasons = STOCK_REASONS;
  readonly modeOptions = [
    { label: 'Add', value: 'add' },
    { label: 'Remove', value: 'remove' },
    { label: 'Set count', value: 'set' },
  ];

  // History drawer
  readonly history = signal<Line | null>(null);
  readonly movements = signal<Movement[] | null>(null);
  readonly historyError = signal<string | null>(null);

  // Count sheet upload
  readonly countRows = signal<StockChange[] | null>(null);
  readonly countError = signal<string | null>(null);
  readonly countSaving = signal(false);

  readonly status = computed<LoadStatus>(() => {
    const base = this.baseStatus();
    if (base !== 'ready') return base;
    if (this.stockError()) return 'error';
    return this.stock() ? 'ready' : 'loading';
  });

  readonly storeOptions = computed(() =>
    (this.stores.value() ?? []).map((s) => ({
      label: s.isActive ? s.name : `${s.name} (inactive)`,
      value: s.id,
    })),
  );

  readonly lines = computed<Line[]>(() => {
    const qty = new Map((this.stock() ?? []).map((r) => [r.variantId, r.quantity]));
    return (this.products.value() ?? []).flatMap((p) =>
      p.variants.map((v) => ({
        productId: p.id,
        variantId: v.id,
        name: p.name,
        size: v.label,
        imageUrl: p.imageUrl,
        isActive: p.isActive,
        quantity: qty.get(v.id) ?? 0,
      })),
    );
  });

  readonly visible = computed(() => {
    const q = this.search().trim().toLowerCase();
    return this.lines().filter(
      (l) => (!q || l.name.toLowerCase().includes(q)) && (!this.lowOnly() || l.quantity < this.low),
    );
  });

  readonly kpis = computed(() => {
    const active = this.lines().filter((l) => l.isActive);
    return {
      skus: active.length,
      out: active.filter((l) => l.quantity === 0).length,
      low: active.filter((l) => l.quantity > 0 && l.quantity < this.low).length,
      units: active.reduce((sum, l) => sum + l.quantity, 0),
    };
  });

  readonly preview = computed(() => {
    const l = this.adjusting();
    const n = this.amount();
    if (!l || n == null) return null;
    const after =
      this.mode() === 'set' ? n : this.mode() === 'add' ? l.quantity + n : l.quantity - n;
    return after;
  });

  constructor() {
    // Default to the first active store.
    effect(() => {
      const stores = this.stores.value();
      if (!this.storeId() && stores?.length) {
        this.storeId.set((stores.find((s) => s.isActive) ?? stores[0]).id);
      }
    });
    let stop: (() => void) | null = null;
    effect(() => {
      const id = this.storeId();
      stop?.();
      this.stock.set(null);
      this.stockError.set(null);
      if (!id) return;
      stop = this.api.listenStock(
        id,
        (rows) => this.stock.set(rows),
        (e) => this.stockError.set(friendlyFirestoreError(e)),
      );
    });
    inject(DestroyRef).onDestroy(() => stop?.());
  }

  storeName(): string {
    return (this.stores.value() ?? []).find((s) => s.id === this.storeId())?.name ?? '';
  }

  openAdjust(l: Line, mode: AdjustMode = 'add'): void {
    this.adjusting.set(l);
    this.mode.set(mode);
    this.amount.set(null);
    this.reason.set(mode === 'add' ? 'restock' : mode === 'set' ? 'count' : 'damage');
    this.note.set('');
    this.adjustError.set(null);
  }

  async saveAdjust(): Promise<void> {
    const l = this.adjusting();
    const n = this.amount();
    const store = this.storeId();
    if (!l || !store || n == null || n < 0 || !Number.isInteger(n)) {
      this.adjustError.set('Enter a whole number.');
      return;
    }
    if (this.preview()! < 0) {
      this.adjustError.set(`Only ${l.quantity} in stock.`);
      return;
    }
    this.saving.set(true);
    this.adjustError.set(null);
    try {
      await this.api.adjustStock(
        [
          {
            storeId: store,
            productId: l.productId,
            variantId: l.variantId,
            mode: this.mode() === 'set' ? 'set' : 'add',
            value: this.mode() === 'remove' ? -n : n,
          },
        ],
        this.reason(),
        this.note(),
      );
      this.toast.success(`${l.name} ${l.size}: ${this.preview()} in stock`);
      this.adjusting.set(null);
    } catch (e) {
      this.adjustError.set((e as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  async openHistory(l: Line): Promise<void> {
    this.history.set(l);
    this.movements.set(null);
    this.historyError.set(null);
    try {
      this.movements.set(await this.api.movements(this.storeId()!, l.variantId));
    } catch (e) {
      this.historyError.set(friendlyFirestoreError(e));
    }
  }

  reasonLabel(m: Movement): string {
    if (m.reason === 'order') return `Sold · order #${shortOrderId(m.orderId ?? '')}`;
    if (m.reason === 'order_cancel')
      return `Back from cancelled order #${shortOrderId(m.orderId ?? '')}`;
    return STOCK_REASONS.find((x) => x.value === m.reason)?.label ?? m.reason;
  }

  // ---- Count sheet --------------------------------------------------------

  async downloadSheet(): Promise<void> {
    const XLSX = await import('xlsx');
    const rows = this.lines().map((l) => ({
      product_id: l.productId,
      variant_id: l.variantId,
      product: l.name,
      size: l.size,
      current_qty: l.quantity,
      new_qty: '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 10 }, { wch: 10 }, { wch: 32 }, { wch: 12 }, { wch: 12 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stock count');
    XLSX.writeFile(wb, `zyppi-stock-${this.storeName().replace(/\s+/g, '-').toLowerCase()}.xlsx`);
  }

  async onCountPicked(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.countError.set(null);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], {
        defval: '',
      });
      const known = new Map(this.lines().map((l) => [l.variantId, l]));
      const changes: StockChange[] = [];
      const bad: number[] = [];
      raw.forEach((r, i) => {
        const v = String(r['new_qty'] ?? '').trim();
        if (v === '') return;
        const n = Number(v);
        const line = known.get(String(r['variant_id'] ?? '').trim());
        if (!line || !Number.isInteger(n) || n < 0 || n > 100000) {
          bad.push(i + 2);
          return;
        }
        if (n !== line.quantity) {
          changes.push({
            storeId: this.storeId()!,
            productId: line.productId,
            variantId: line.variantId,
            mode: 'set',
            value: n,
          });
        }
      });
      if (bad.length) {
        this.countError.set(
          `Rows ${bad.slice(0, 10).join(', ')}${bad.length > 10 ? '…' : ''} have an unknown variant_id or a new_qty that isn’t a whole number. Fix them and upload again.`,
        );
        return;
      }
      if (!changes.length) {
        this.countError.set('No changes: fill new_qty where the count differs.');
        return;
      }
      this.countRows.set(changes);
    } catch {
      this.countError.set('Couldn’t read that file. Use the downloaded stock sheet.');
    }
  }

  async applyCounts(): Promise<void> {
    const rows = this.countRows();
    if (!rows) return;
    this.countSaving.set(true);
    try {
      for (let i = 0; i < rows.length; i += 200) {
        await this.api.adjustStock(rows.slice(i, i + 200), 'count', 'Stock count upload');
      }
      this.toast.success(`${rows.length} stock counts saved`);
      this.countRows.set(null);
    } catch (e) {
      this.countError.set((e as Error).message);
    } finally {
      this.countSaving.set(false);
    }
  }

  retry(): void {
    this.stores.retry();
    this.products.retry();
    const id = this.storeId();
    this.storeId.set(null);
    queueMicrotask(() => this.storeId.set(id));
  }
}
