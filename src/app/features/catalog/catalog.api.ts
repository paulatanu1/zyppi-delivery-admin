import { Injectable, inject } from '@angular/core';
import {
  Timestamp,
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { Callables } from '../../core/firebase/callable';
import { FIRESTORE, STORAGE } from '../../core/firebase/firebase';
import { Live, liveQuery } from '../../core/firebase/live';
import { compressImage } from '../../shared/util/image';
import { Category, Product, StockRow, Store, toCategory, toProduct } from './catalog.models';

export type ImageFolder = 'products' | 'categories' | 'banners' | 'notifications';

export interface ProductPayload {
  id?: string;
  name: string;
  description: string;
  categoryId: string;
  subcategoryId: string | null;
  imageUrl: string | null;
  isActive: boolean;
  /** Omitted = keep the stored one (also for gtin and details). */
  brand?: string | null;
  variants: {
    id?: string;
    label: string;
    pricePaise: number;
    mrpPaise: number;
    /** GTIN (any EAN / UPC form; the server stores GTIN-14) or null to clear. */
    gtin?: string | null;
  }[];
}

export interface CategoryPayload {
  id?: string;
  name: string;
  parentId: string | null;
  imageUrl: string | null;
  colorHex: string | null;
  borderColorHex: string | null;
}

export interface ImportRow {
  row: number;
  productId?: string | null;
  key?: string | null;
  name?: string | null;
  description?: string | null;
  category?: string | null;
  subcategory?: string | null;
  variant?: string | null;
  pricePaise?: number | null;
  mrpPaise?: number | null;
  imageUrl?: string | null;
  active?: boolean | null;
}

export interface ImportResult {
  created: number;
  updated: number;
  failedRows: number;
  results: {
    row: number;
    status: 'created' | 'updated' | 'error';
    productId?: string;
    message?: string;
  }[];
}

export type StockReason = 'restock' | 'count' | 'damage' | 'expired' | 'return' | 'correction';

export interface StockChange {
  storeId: string;
  productId: string;
  variantId: string;
  mode: 'add' | 'set';
  value: number;
}

export interface Movement {
  id: string;
  delta: number;
  before: number;
  after: number;
  /** Staff reasons, plus `order` / `order_cancel` written by orders. */
  reason: StockReason | 'order' | 'order_cancel';
  orderId: string | null;
  note: string | null;
  actorEmail: string | null;
  at: Timestamp | null;
}

/** Catalog reads (live) and writes (callables only; rules block direct writes). */
@Injectable({ providedIn: 'root' })
export class CatalogApi {
  private readonly db = inject(FIRESTORE);
  private readonly storage = inject(STORAGE);
  private readonly callables = inject(Callables);

  /** Injection context only. */
  watchCategories(): Live<Category[]> {
    return liveQuery(query(collection(this.db, 'categories'), orderBy('sortOrder')), (s) =>
      s.docs.map((d) => toCategory(d.id, d.data())),
    );
  }

  /** Injection context only. Whole catalog (hundreds to a few thousand docs). */
  watchProducts(): Live<Product[]> {
    return liveQuery(query(collection(this.db, 'products'), orderBy('name')), (s) =>
      s.docs.map((d) => toProduct(d.id, d.data())),
    );
  }

  /** Injection context only. */
  watchStores(): Live<Store[]> {
    return liveQuery(query(collection(this.db, 'stores'), orderBy('name')), (s) =>
      s.docs.map((d) => ({
        id: d.id,
        name: (d.get('name') as string) ?? d.id,
        serviceAreaId: (d.get('serviceAreaId') as string) ?? '',
        isActive: d.get('isActive') === true,
      })),
    );
  }

  /** Live stock of one store; returns the unsubscribe (the page switches stores). */
  listenStock(
    storeId: string,
    next: (rows: StockRow[]) => void,
    fail: (e: Error) => void,
  ): () => void {
    return onSnapshot(
      query(collection(this.db, 'inventory'), where('storeId', '==', storeId)),
      (s) =>
        next(
          s.docs.map((d) => ({
            storeId,
            variantId: (d.get('variantId') as string) ?? '',
            productId: (d.get('productId') as string) ?? '',
            quantity: Number(d.get('quantity')) || 0,
          })),
        ),
      fail,
    );
  }

  async movements(storeId: string, variantId: string): Promise<Movement[]> {
    const snap = await getDocs(
      query(
        collection(this.db, 'inventoryMovements'),
        where('storeId', '==', storeId),
        where('variantId', '==', variantId),
        orderBy('at', 'desc'),
        limit(50),
      ),
    );
    return snap.docs.map((d) => ({
      id: d.id,
      delta: d.get('delta') ?? 0,
      before: d.get('before') ?? 0,
      after: d.get('after') ?? 0,
      reason: d.get('reason'),
      note: d.get('note') ?? null,
      orderId: d.get('orderId') ?? null,
      actorEmail: d.get('actorEmail') ?? null,
      at: d.get('at') instanceof Timestamp ? d.get('at') : null,
    }));
  }

  saveProduct(p: ProductPayload): Promise<{ id: string; created: boolean }> {
    return this.callables.call('adminSaveProduct', p);
  }

  saveCategory(c: CategoryPayload): Promise<{ id: string }> {
    return this.callables.call('adminSaveCategory', c);
  }

  deleteCategory(id: string): Promise<unknown> {
    return this.callables.call('adminDeleteCategory', { id });
  }

  reorderCategories(parentId: string | null, ids: string[]): Promise<unknown> {
    return this.callables.call('adminReorderCategories', { parentId, ids });
  }

  importProducts(rows: ImportRow[]): Promise<ImportResult> {
    return this.callables.call('adminImportProducts', { rows });
  }

  adjustStock(items: StockChange[], reason: StockReason, note = ''): Promise<{ updated: number }> {
    return this.callables.call('adminAdjustStock', { items, reason, note });
  }

  /** Compresses to WebP and uploads under catalog/<folder>/, banners/ or notifications/ (public read). */
  async uploadImage(file: Blob, folder: ImageFolder): Promise<string> {
    const blob = await compressImage(file);
    const dir = folder === 'banners' || folder === 'notifications' ? folder : `catalog/${folder}`;
    const r = ref(this.storage, `${dir}/${crypto.randomUUID()}.webp`);
    await uploadBytes(r, blob, {
      contentType: 'image/webp',
      cacheControl: 'public,max-age=31536000',
    });
    return getDownloadURL(r);
  }
}

export const STOCK_REASONS: { value: StockReason; label: string }[] = [
  { value: 'restock', label: 'Restock (new delivery)' },
  { value: 'count', label: 'Stock count' },
  { value: 'damage', label: 'Damaged' },
  { value: 'expired', label: 'Expired' },
  { value: 'return', label: 'Customer return' },
  { value: 'correction', label: 'Correction' },
];
