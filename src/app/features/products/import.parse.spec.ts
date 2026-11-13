import { chunkByGroup, missingColumns, parseRows } from './import.parse';

describe('parseRows', () => {
  it('reads template rows, aliases and rupee amounts', () => {
    const [a, b] = parseRows([
      {
        Key: 'ghee',
        'Product name': 'Amul Ghee',
        Category: 'Dairy',
        Size: '500 ml',
        'Price (₹)': '320',
        MRP: '₹340',
        Active: 'yes',
      },
      { key: 'ghee', variant: '1 L', price: 620, mrp: 650 },
    ]);
    expect(a.problems).toEqual([]);
    expect(a.data).toMatchObject({
      row: 2,
      name: 'Amul Ghee',
      variant: '500 ml',
      pricePaise: 32000,
      mrpPaise: 34000,
      active: true,
    });
    expect(b.data).toMatchObject({ row: 3, pricePaise: 62000 });
    expect(a.group).toBe(b.group);
  });

  it('flags bad amounts, MRP below price and bad yes/no', () => {
    const [r] = parseRows([
      { name: 'X', category: 'Dairy', variant: '1', price: '12.345', mrp: '5', active: 'maybe' },
    ]);
    expect(r.problems).toEqual([
      'Price “12.345” isn’t a valid amount',
      'Active must be yes or no (got “maybe”)',
    ]);
    const [s] = parseRows([{ name: 'X', category: 'Dairy', variant: '1', price: '10', mrp: '5' }]);
    expect(s.problems).toEqual(['MRP is below the price']);
  });

  it('needs a name and category for new products, not for updates', () => {
    const rows = parseRows([
      { key: 'k', variant: '1', price: 10 },
      { product_id: 'p1', price: 12, variant: '1 kg' },
      { product_id: 'p2', active: 'no' },
    ]);
    expect(rows[0].problems).toEqual(['Name is empty', 'Category is empty']);
    expect(rows[1].problems).toEqual([]);
    expect(rows[2].problems).toEqual([]);
  });

  it('matches image file names to the selected photos', () => {
    const rows = parseRows(
      [
        { name: 'A', category: 'C', variant: '1', price: 1, image: 'photos/Ghee.JPG' },
        { name: 'B', category: 'C', variant: '1', price: 1, image: 'missing.png' },
        { name: 'C', category: 'C', variant: '1', price: 1, image: 'https://cdn.x/c.png' },
      ],
      ['ghee.jpg'],
    );
    expect(rows[0].problems).toEqual([]);
    expect(rows[0].imageRef).toBe('Ghee.JPG');
    expect(rows[1].problems).toEqual(['Image file “missing.png” wasn’t selected']);
    expect(rows[2].imageRef).toBe('https://cdn.x/c.png');
  });
});

describe('chunkByGroup', () => {
  it('never splits a product across requests', () => {
    const rows = parseRows(
      Array.from({ length: 5 }, (_, i) => ({
        key: `k${Math.floor(i / 2)}`,
        name: 'N',
        category: 'C',
        variant: `${i}`,
        price: 1,
      })),
    );
    const chunks = chunkByGroup(rows, 3);
    expect(chunks.map((c) => c.length)).toEqual([2, 3]);
    // k0 | k1 + k2: each product's rows stay in one request.
    expect(chunks.map((c) => [...new Set(c.map((r) => r.group))])).toEqual([
      ['key:k0'],
      ['key:k1', 'key:k2'],
    ]);
  });
});

describe('missingColumns', () => {
  it('needs size and price columns', () => {
    expect(missingColumns(['Name', 'Size', 'Price (₹)'])).toEqual([]);
    expect(missingColumns(['name'])).toEqual(['variant', 'price']);
  });
});
