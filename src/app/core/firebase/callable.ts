import { Injectable, inject } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import { FUNCTIONS } from './firebase';

/** Typed Cloud Functions callables (asia-south1). */
@Injectable({ providedIn: 'root' })
export class Callables {
  private readonly functions = inject(FUNCTIONS);

  async call<Req, Res>(name: string, data: Req): Promise<Res> {
    try {
      const result = await httpsCallable<Req, Res>(this.functions, name)(data);
      return result.data;
    } catch (e) {
      throw new Error(callableErrorMessage(e), { cause: e });
    }
  }
}

/** Server reason codes (not sentences) worth explaining. */
const KNOWN_CODES: Record<string, string> = {
  // functions/src/catalog/products.ts, marketplace/product_requests.ts
  DUPLICATE_BARCODE:
    'This barcode is already on another product. Search the catalogue for it, or clear the barcode.',
  BARCODE_PENDING: 'A seller request with this barcode is already waiting for review.',
  INVALID_BARCODE: 'That isn’t a valid product barcode (EAN-13, EAN-8, UPC-A or UPC-E).',
  RATE_LIMITED: 'Too many tries. Wait a minute and try again.',
};

/** The server's own message for expected errors, a generic one otherwise. */
export function callableErrorMessage(e: unknown): string {
  const err = e as { code?: string; message?: string };
  const code = err?.code ?? '';
  // functions/src/shared/hardening.ts
  if (err?.message === 'APP_CHECK_FAILED') {
    return 'This browser couldn’t be verified. Reload the page and try again.';
  }
  const expected = [
    'invalid-argument',
    'not-found',
    'failed-precondition',
    'already-exists',
    'out-of-range',
  ];
  const known = KNOWN_CODES[err?.message ?? ''];
  if (known) return known;
  if (expected.some((c) => code.endsWith(c)) && err.message) return err.message;
  if (code.endsWith('permission-denied')) return 'Your role isn’t allowed to do this.';
  if (code.endsWith('unauthenticated')) return 'Your session ended. Sign in again.';
  if (code.endsWith('unavailable') || code.endsWith('deadline-exceeded')) {
    return 'Can’t reach the server. Check your connection and try again.';
  }
  return 'Something went wrong. Please try again.';
}
