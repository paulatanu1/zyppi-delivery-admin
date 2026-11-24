import {
  Category,
  argbToCss,
  categoryPath,
  cssToArgb,
  discountPercent,
  rupeesToPaise,
  toProduct,
} from './catalog.models';

describe('rupeesToPaise', () => {
  it('parses typed and spreadsheet amounts', () => {
    expect(rupeesToPaise('₹1,234.50')).toBe(123450);
    expect(rupeesToPaise('56')).toBe(5600);
    expect(rupeesToPaise(64.9)).toBe(6490);
    expect(rupeesToPaise('Rs. 10')).toBe(1000);
  });

  it('rejects junk, negatives and fractions of a paisa', () => {
    expect(rupeesToPaise('abc')).toBeNull();
    expect(rupeesToPaise('1.234')).toBeNull();
    expect(rupeesToPaise(-5)).toBeNull();
    expect(rupeesToPaise(undefined)).toBeNull();
  });
});

describe('helpers', () => {
  it('computes a whole discount percent', () => {
    expect(discountPercent(5600, 6000)).toBe(7);
    expect(discountPercent(6000, 6000)).toBe(0);
  });

  it('builds the category path', () => {
    const cat = (id: string, name: string): Category => ({
      id,
      name,
      parentId: null,
      imageUrl: null,
      colorHex: null,
      borderColorHex: null,
      sortOrder: 0,
    });
    const cats = new Map([
      ['c1', cat('c1', 'Dairy')],
      ['s1', cat('s1', 'Butter')],
    ]);
    expect(categoryPath(cats, 'c1', 's1')).toBe('Dairy › Butter');
    expect(categoryPath(cats, 'c1', null)).toBe('Dairy');
  });

  it('converts colours both ways', () => {
    expect(argbToCss('FF53B175')).toBe('#53b175');
    expect(cssToArgb('#53b175')).toBe('FF53B175');
  });

  it('reads a product doc tolerantly', () => {
    const p = toProduct('p1', {
      name: 'Milk',
      variants: [{ id: 'v', label: '1 L', pricePaise: 6400 }],
    });
    expect(p).toMatchObject({ name: 'Milk', isActive: true, subcategoryId: null });
    expect(p.variants[0].mrpPaise).toBe(0);
  });

  it('reads brand and barcodes', () => {
    const p = toProduct('p1', {
      name: 'Nutella',
      brand: 'Ferrero',
      variants: [
        { id: 'v', label: '400 g', pricePaise: 1, gtin: '03017620422003' },
        { id: 'w', label: '750 g', pricePaise: 1 },
      ],
    });
    expect(p.brand).toBe('Ferrero');
    expect(p.variants.map((v) => v.gtin)).toEqual(['03017620422003', null]);
  });
});
