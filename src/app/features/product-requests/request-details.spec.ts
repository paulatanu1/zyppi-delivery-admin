import { toRequestDetails } from './request-details';

describe('toRequestDetails', () => {
  it('summarizes details, provenance and attribution', () => {
    const d = toRequestDetails({
      quantity: { value: 400, unit: 'g' },
      allergens: ['milk', 'nuts'],
      nutrition: { basis: 'per100g', energyKcal: 539, fat: 30.9 },
      provenance: { name: 'off', brand: 'off_edited', origin: 'manual' },
      source: {
        provider: 'openfoodfacts',
        url: 'https://world.openfoodfacts.org/product/3017620422003',
        fetchedAt: '2026-11-24T00:00:00Z',
      },
    })!;
    expect(d.quantity).toBe('400 g');
    expect(d.allergens).toEqual(['milk', 'nuts']);
    expect(d.nutrition).toBe('per 100 g: 539 kcal · fat 30.9 g');
    expect(d.provenance).toEqual([
      { field: 'name', value: 'off' },
      { field: 'brand', value: 'off_edited' },
    ]);
    expect(d.source?.name).toBe('Open Food Facts');
  });

  it('nothing or junk', () => {
    expect(toRequestDetails(null)).toBeNull();
    expect(toRequestDetails('x')).toBeNull();
    const d = toRequestDetails({ source: { url: 'javascript:alert(1)' }, allergens: [1] })!;
    expect(d.source).toBeNull();
    expect(d.allergens).toEqual([]);
  });
});
