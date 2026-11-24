import { barcodeProblem, barcodeValue, printedGtin } from './barcode';
import { parseGtin } from './gtin';

// Same vectors as zyppi-APP functions/test/unit/gtin.test.ts.
describe('gtin (copy of the server parser)', () => {
  it('normalizes EAN-13, UPC-A, EAN-8 and UPC-E to GTIN-14', () => {
    expect(parseGtin('3017620422003')).toEqual({
      ok: true,
      gtin: '03017620422003',
      kind: 'gtin13',
      offCode: '3017620422003',
    });
    expect(parseGtin('036000291452')).toMatchObject({ gtin: '00036000291452' });
    expect(parseGtin('96385074')).toMatchObject({ gtin: '00000096385074' });
    expect(parseGtin('04252614', 'upce')).toMatchObject({ gtin: '00042100005264' });
  });

  it('rejects bad check digits and in-store codes', () => {
    expect(parseGtin('3017620422004')).toEqual({ ok: false, problem: 'check_digit' });
    expect(parseGtin('2012345001007')).toMatchObject({ ok: false });
  });
});

describe('barcode helpers', () => {
  it('explains problems; empty is fine', () => {
    expect(barcodeProblem('')).toBeNull();
    expect(barcodeProblem(' 8901058851298 ')).toBeNull();
    expect(barcodeProblem('8901058851299')).toContain('last digit');
    expect(barcodeProblem('12345')).toContain('digits');
  });

  it('sends GTIN-14 or null', () => {
    expect(barcodeValue('036000291452')).toBe('00036000291452');
    expect(barcodeValue('')).toBeNull();
    expect(barcodeValue('nope')).toBeNull();
  });

  it('prints what is under the bars', () => {
    expect(printedGtin('03017620422003')).toBe('3017620422003');
    expect(printedGtin('00036000291452')).toBe('036000291452');
    expect(printedGtin('00000096385074')).toBe('96385074');
  });
});
