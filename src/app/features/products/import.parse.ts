import { ImportRow } from '../catalog/catalog.api';
import { rupeesToPaise } from '../catalog/catalog.models';

/** Columns of the bulk-upload template, in order. */
export const TEMPLATE_COLUMNS = [
  'product_id',
  'key',
  'name',
  'description',
  'category',
  'subcategory',
  'variant',
  'price',
  'mrp',
  'image',
  'active',
] as const;
type Column = (typeof TEMPLATE_COLUMNS)[number];

/** Header spellings people actually use → template column. */
const ALIASES: Record<string, Column> = {
  product_id: 'product_id',
  id: 'product_id',
  key: 'key',
  group: 'key',
  name: 'name',
  product: 'name',
  product_name: 'name',
  description: 'description',
  category: 'category',
  subcategory: 'subcategory',
  sub_category: 'subcategory',
  variant: 'variant',
  size: 'variant',
  unit: 'variant',
  price: 'price',
  selling_price: 'price',
  sale_price: 'price',
  mrp: 'mrp',
  image: 'image',
  image_url: 'image',
  photo: 'image',
  active: 'active',
  show_in_app: 'active',
  status: 'active',
};

export interface ParsedRow {
  /** Spreadsheet row number (header = 1). */
  row: number;
  data: ImportRow;
  /** Raw `image` cell: an https URL or a file name to match. */
  imageRef: string | null;
  problems: string[];
  /** Grouping key, same rule as the server. */
  group: string;
}

const cell = (v: unknown): string => (v == null ? '' : String(v).trim());

function normalizeHeader(h: string): Column | null {
  const k = h
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .trim()
    .replace(/[\s-]+/g, '_');
  return ALIASES[k] ?? null;
}

function parseActive(v: string): boolean | null | 'bad' {
  if (!v) return null;
  const k = v.toLowerCase();
  if (['yes', 'y', 'true', '1', 'active', 'show', 'on'].includes(k)) return true;
  if (['no', 'n', 'false', '0', 'hidden', 'hide', 'off'].includes(k)) return false;
  return 'bad';
}

/**
 * Sheet rows (objects keyed by header, as SheetJS returns) → typed rows with
 * every problem we can spot before talking to the server.
 */
export function parseRows(
  sheet: Record<string, unknown>[],
  imageFiles: string[] = [],
): ParsedRow[] {
  const files = new Set(imageFiles.map((f) => f.toLowerCase()));
  const parsed = sheet.map((raw, i): ParsedRow => {
    const get: Partial<Record<Column, string>> = {};
    for (const [h, v] of Object.entries(raw)) {
      const col = normalizeHeader(h);
      if (col && !get[col]) get[col] = cell(v);
    }
    const problems: string[] = [];
    const price = get.price ? rupeesToPaise(get.price) : null;
    const mrp = get.mrp ? rupeesToPaise(get.mrp) : null;
    if (get.price && price === null) problems.push(`Price “${get.price}” isn’t a valid amount`);
    if (get.mrp && mrp === null) problems.push(`MRP “${get.mrp}” isn’t a valid amount`);
    if (price !== null && price <= 0) problems.push('Price must be more than ₹0');
    if (price !== null && mrp !== null && mrp < price) problems.push('MRP is below the price');
    const hasVariant = !!(get.variant || get.price || get.mrp);
    if (hasVariant && !get.variant) problems.push('Size/variant is empty');
    if (hasVariant && price === null && !get.price) problems.push('Price is empty');
    if (!hasVariant && !get.product_id) problems.push('Add a size and price');

    const active = parseActive(get.active ?? '');
    if (active === 'bad') problems.push(`Active must be yes or no (got “${get.active}”)`);

    let imageRef: string | null = get.image || null;
    if (imageRef && !/^https:\/\//i.test(imageRef)) {
      const base = imageRef.split(/[\\/]/).pop()!.toLowerCase();
      if (!files.has(base)) problems.push(`Image file “${imageRef}” wasn’t selected`);
      imageRef = imageRef.split(/[\\/]/).pop()!;
    }

    const productId = get.product_id || null;
    const key = get.key || null;
    const group = productId
      ? `id:${productId}`
      : key
        ? `key:${key.toLowerCase()}`
        : `name:${(get.name ?? '').toLowerCase()}|${(get.category ?? '').toLowerCase()}`;

    return {
      row: i + 2,
      group,
      imageRef,
      problems,
      data: {
        row: i + 2,
        productId,
        key,
        name: get.name || null,
        description: get.description || null,
        category: get.category || null,
        subcategory: get.subcategory || null,
        variant: get.variant || null,
        pricePaise: price,
        mrpPaise: mrp,
        imageUrl: null,
        active: active === 'bad' ? null : active,
      },
    };
  });

  // Group checks: a new product needs a name and a category somewhere in its rows.
  const groups = new Map<string, ParsedRow[]>();
  for (const r of parsed) groups.set(r.group, [...(groups.get(r.group) ?? []), r]);
  for (const rows of groups.values()) {
    if (rows[0].data.productId) continue;
    const missing: string[] = [];
    if (!rows.some((r) => r.data.name)) missing.push('Name is empty');
    if (!rows.some((r) => r.data.category)) missing.push('Category is empty');
    for (const r of rows) r.problems.push(...missing);
  }
  return parsed;
}

/** Whole products per request, ≤ `max` rows each (server cap 300). */
export function chunkByGroup(rows: ParsedRow[], max = 250): ParsedRow[][] {
  const groups = new Map<string, ParsedRow[]>();
  for (const r of rows) groups.set(r.group, [...(groups.get(r.group) ?? []), r]);
  const chunks: ParsedRow[][] = [];
  let current: ParsedRow[] = [];
  for (const g of groups.values()) {
    if (current.length && current.length + g.length > max) {
      chunks.push(current);
      current = [];
    }
    current.push(...g);
  }
  if (current.length) chunks.push(current);
  return chunks;
}

/** True if the sheet has at least the columns we need to make sense of it. */
export function missingColumns(headers: string[]): string[] {
  const cols = new Set(headers.map(normalizeHeader).filter(Boolean));
  const need: Column[] = ['variant', 'price'];
  return need.filter((c) => !cols.has(c));
}
