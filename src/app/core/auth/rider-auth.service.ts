import { Injectable, inject } from '@angular/core';
import {
  ConfirmationResult,
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInWithPopup,
} from 'firebase/auth';
import { FIREBASE_AUTH } from '../firebase/firebase';

/**
 * Sign-in for the public rider portal (/rider): phone OTP, or Google when
 * OTP is switched off in Settings. Riders never get a staff role, so the
 * admin pages stay closed to them.
 */
@Injectable({ providedIn: 'root' })
export class RiderAuthService {
  private readonly auth = inject(FIREBASE_AUTH);
  private verifier: RecaptchaVerifier | null = null;
  private pending: ConfirmationResult | null = null;

  /** `buttonId`: the element the invisible reCAPTCHA attaches to. */
  async sendOtp(phone10: string, buttonId: string): Promise<void> {
    this.verifier?.clear();
    this.verifier = new RecaptchaVerifier(this.auth, buttonId, { size: 'invisible' });
    this.pending = await signInWithPhoneNumber(this.auth, `+91${phone10}`, this.verifier);
  }

  async confirmOtp(code: string): Promise<void> {
    if (!this.pending) throw Object.assign(new Error('expired'), { code: 'auth/code-expired' });
    await this.pending.confirm(code);
    this.pending = null;
  }

  async google(): Promise<void> {
    await signInWithPopup(this.auth, new GoogleAuthProvider());
  }
}

export function riderAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-phone-number':
      return 'That mobile number doesn’t look right.';
    case 'auth/invalid-verification-code':
      return 'Wrong code. Check the SMS and try again.';
    case 'auth/code-expired':
      return 'The code expired. Send a new one.';
    case 'auth/too-many-requests':
      return 'Too many tries. Wait a while and try again.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Sign-in was cancelled.';
    case 'auth/network-request-failed':
      return 'No connection. Check your internet.';
    default:
      return 'Couldn’t sign you in. Please try again.';
  }
}
