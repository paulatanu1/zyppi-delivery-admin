import { formatPaise } from './rupees.pipe';

describe('formatPaise', () => {
  it('drops paise on whole rupees', () => {
    expect(formatPaise(14900)).toBe('₹149');
  });

  it('keeps two decimals otherwise', () => {
    expect(formatPaise(14950)).toBe('₹149.50');
  });

  it('uses Indian grouping', () => {
    expect(formatPaise(12345600)).toBe('₹1,23,456');
  });

  it('shows a dash for missing values', () => {
    expect(formatPaise(null)).toBe('—');
    expect(formatPaise(undefined)).toBe('—');
  });
});
