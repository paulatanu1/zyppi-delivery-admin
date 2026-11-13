import { diff } from './audit.api';

describe('diff', () => {
  it('lists only changed leaves with dotted paths', () => {
    const before = { placesSearch: true, payments: { upi: true, card: true }, closedAreaIds: [] };
    const after = {
      placesSearch: false,
      payments: { upi: true, card: false },
      closedAreaIds: ['a'],
    };
    expect(diff(before, after)).toEqual([
      { path: 'closedAreaIds', before: '[]', after: '["a"]' },
      { path: 'payments.card', before: 'true', after: 'false' },
      { path: 'placesSearch', before: 'true', after: 'false' },
    ]);
  });

  it('shows missing and empty values readably', () => {
    expect(diff({ role: null }, { role: 'ops' })).toEqual([
      { path: 'role', before: '—', after: 'ops' },
    ]);
    expect(diff({ m: 'x' }, { m: '' })).toEqual([{ path: 'm', before: 'x', after: '(empty)' }]);
  });

  it('returns nothing when equal', () => {
    expect(diff({ a: 1 }, { a: 1 })).toEqual([]);
  });
});
