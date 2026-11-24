import { type GtinProblem, offCode, parseGtin } from './gtin';

/** Barcode helpers for the product editor and the request review. */

const GTIN_PROBLEMS: Record<GtinProblem, string> = {
  invalid_format: 'barcode must be 8, 12, 13 or 14 digits',
  check_digit: 'barcode’s last digit doesn’t match (mistyped?)',
  variable_measure: 'that’s an in-store / weighed-item barcode, leave it empty',
  restricted: 'that’s a coupon or company-internal barcode',
};

/** Problem text for a typed barcode, or null when it's empty or valid. */
export function barcodeProblem(text: string): string | null {
  if (!text.trim()) return null;
  const r = parseGtin(text);
  return r.ok ? null : GTIN_PROBLEMS[r.problem];
}

/** GTIN-14 → the digits printed under the bars (EAN-8, UPC-A or EAN-13). */
export function printedGtin(gtin: string): string {
  const code = offCode(gtin);
  return code.length === 13 && code.startsWith('0') ? code.slice(1) : code;
}

/** The GTIN-14 to send: null when empty (clears it). Call after barcodeProblem. */
export function barcodeValue(text: string): string | null {
  const r = parseGtin(text);
  return text.trim() && r.ok ? r.gtin : null;
}
