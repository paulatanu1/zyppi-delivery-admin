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
  if (expected.some((c) => code.endsWith(c)) && err.message) return err.message;
  if (code.endsWith('permission-denied')) return 'Your role isn’t allowed to do this.';
  if (code.endsWith('unauthenticated')) return 'Your session ended. Sign in again.';
  if (code.endsWith('unavailable') || code.endsWith('deadline-exceeded')) {
    return 'Can’t reach the server. Check your connection and try again.';
  }
  return 'Something went wrong. Please try again.';
}
