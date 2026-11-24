/**
 * A seller request's optional product details (zyppi-APP
 * functions/src/catalog/details.ts, already sanitized by the server), as
 * the review card shows them.
 */
export type Provenance = 'off' | 'off_edited' | 'manual';

export interface RequestDetails {
  quantity: string | null;
  packaging: string | null;
  ingredients: string | null;
  allergens: string[];
  labels: string[];
  origin: string | null;
  /** "per 100 g: 539 kcal · fat 30.9 g · …" */
  nutrition: string | null;
  /** Fields that came from Open Food Facts, with how they were treated. */
  provenance: { field: string; value: Provenance }[];
  source: { name: string; url: string } | null;
}

const PROVIDERS: Record<string, string> = {
  openfoodfacts: 'Open Food Facts',
  openbeautyfacts: 'Open Beauty Facts',
  openpetfoodfacts: 'Open Pet Food Facts',
  openproductsfacts: 'Open Products Facts',
};

const BASIS: Record<string, string> = {
  per100g: 'per 100 g',
  per100ml: 'per 100 ml',
  perServing: 'per serving',
};

const NUTRIENTS: [string, string, string][] = [
  ['energyKcal', '', 'kcal'],
  ['fat', 'fat', 'g'],
  ['saturatedFat', 'sat. fat', 'g'],
  ['carbohydrates', 'carbs', 'g'],
  ['sugars', 'sugars', 'g'],
  ['protein', 'protein', 'g'],
  ['fibre', 'fibre', 'g'],
  ['salt', 'salt', 'g'],
];

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
const tags = (v: unknown) =>
  Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string') : [];
const rec = (v: unknown) =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

export function toRequestDetails(raw: unknown): RequestDetails | null {
  const d = rec(raw);
  if (!d) return null;
  const q = rec(d['quantity']);
  const n = rec(d['nutrition']);
  let nutrition: string | null = null;
  if (n) {
    const parts = NUTRIENTS.filter(([k]) => typeof n[k] === 'number').map(([k, label, unit]) =>
      `${label} ${n[k]} ${unit}`.trim(),
    );
    const basis = BASIS[String(n['basis'])] ?? '';
    const serving = text(n['servingSize']);
    if (parts.length) {
      nutrition = `${basis}${serving ? ` (${serving})` : ''}: ${parts.join(' · ')}`;
    }
  }
  const prov = rec(d['provenance']) ?? {};
  const provenance = Object.entries(prov)
    .filter((e): e is [string, Provenance] => e[1] === 'off' || e[1] === 'off_edited')
    .map(([field, value]) => ({ field, value }));
  const s = rec(d['source']);
  const url = text(s?.['url']);
  return {
    quantity: q && typeof q['value'] === 'number' ? `${q['value']} ${String(q['unit'])}` : null,
    packaging: text(d['packaging']),
    ingredients: text(d['ingredients']),
    allergens: tags(d['allergens']),
    labels: tags(d['labels']),
    origin: text(d['origin']),
    nutrition,
    provenance,
    source:
      s && url && /^https:\/\//.test(url)
        ? { name: PROVIDERS[String(s['provider'])] ?? 'Open Food Facts', url }
        : null,
  };
}
