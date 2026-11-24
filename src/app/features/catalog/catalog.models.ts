import { Timestamp } from 'firebase/firestore';

/** Shapes of products / categories / stores as stored (see zyppi-APP functions/src/catalog). */
export interface Variant {
  id: string;
  label: string;
  pricePaise: number;
  mrpPaise: number;
  /** 14-digit GTIN (docs/BARCODES.md in zyppi-APP), when the pack has one. */
  gtin: string | null;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  categoryId: string;
  subcategoryId: string | null;
  imageUrl: string | null;
  isActive: boolean;
  brand: string | null;
  variants: Variant[];
  updatedAt: Timestamp | null;
}

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  imageUrl: string | null;
  colorHex: string | null;
  borderColorHex: string | null;
  sortOrder: number;
}

export interface Store {
  id: string;
  name: string;
  serviceAreaId: string;
  isActive: boolean;
}

export interface StockRow {
  storeId: string;
  variantId: string;
  productId: string;
  quantity: number;
}

/** Below this many units a row shows as low stock. */
export const LOW_STOCK = 5;

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function toProduct(id: string, d: Record<string, unknown>): Product {
  const variants = Array.isArray(d['variants']) ? (d['variants'] as Record<string, unknown>[]) : [];
  return {
    id,
    name: str(d['name']),
    description: str(d['description']),
    categoryId: str(d['categoryId']),
    subcategoryId: str(d['subcategoryId']) || null,
    imageUrl: str(d['imageUrl']) || null,
    isActive: d['isActive'] !== false,
    brand: str(d['brand']) || null,
    variants: variants.map((v) => ({
      id: str(v['id']),
      label: str(v['label']),
      pricePaise: Number(v['pricePaise']) || 0,
      mrpPaise: Number(v['mrpPaise']) || 0,
      gtin: str(v['gtin']) || null,
    })),
    updatedAt: d['updatedAt'] instanceof Timestamp ? d['updatedAt'] : null,
  };
}

export function toCategory(id: string, d: Record<string, unknown>): Category {
  return {
    id,
    name: str(d['name']),
    parentId: str(d['parentId']) || null,
    imageUrl: str(d['imageUrl']) || null,
    colorHex: str(d['colorHex']) || null,
    borderColorHex: str(d['borderColorHex']) || null,
    sortOrder: Number(d['sortOrder']) || 0,
  };
}

/** "₹1,234.50", "1234.5", 99 → paise (int); null when not a valid amount. */
export function rupeesToPaise(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
  }
  if (typeof value !== 'string') return null;
  const clean = value.replace(/[₹,\s]/g, '').replace(/^rs\.?/i, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

export function paiseToRupees(paise: number): number {
  return Math.round(paise) / 100;
}

/** Whole-number discount for display: MRP 60, price 56 → 7. */
export function discountPercent(pricePaise: number, mrpPaise: number): number {
  if (!mrpPaise || mrpPaise <= pricePaise) return 0;
  return Math.round(((mrpPaise - pricePaise) / mrpPaise) * 100);
}

/** "Dairy › Butter" for a product's categories. */
export function categoryPath(
  cats: Map<string, Category>,
  categoryId: string,
  subcategoryId: string | null,
): string {
  const top = cats.get(categoryId)?.name ?? 'Unknown category';
  const sub = subcategoryId ? cats.get(subcategoryId)?.name : null;
  return sub ? `${top} › ${sub}` : top;
}

/** ARGB "FF53B175" ↔ "#53b175" for <input type=color> (alpha kept separately). */
export function argbToCss(argb: string | null): string {
  if (!argb || !/^[0-9A-F]{8}$/i.test(argb)) return '#ede7f6';
  return `#${argb.slice(2).toLowerCase()}`;
}

export function cssToArgb(css: string, alpha = 'FF'): string {
  return `${alpha}${css.replace('#', '').toUpperCase()}`;
}
