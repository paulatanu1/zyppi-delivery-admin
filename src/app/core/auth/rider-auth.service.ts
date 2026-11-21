import { Injectable, inject } from '@angular/core';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { FIREBASE_AUTH } from '../firebase/firebase';

/**
 * Sign-in for the public rider portal (/rider): email + password or Google.
 * No phone numbers or SMS codes. Riders never get a staff role, so the admin
 * pages stay closed to them.
 */
@Injectable({ providedIn: 'root' })
export class RiderAuthService {
  private readonly auth = inject(FIREBASE_AUTH);

  async signIn(email: string, password: string): Promise<void> {
    await signInWithEmailAndPassword(this.auth, email.trim(), password);
  }

  /** New account; sends the verification email (not required to apply). */
  async signUp(name: string, email: string, password: string): Promise<void> {
    const cred = await createUserWithEmailAndPassword(this.auth, email.trim(), password);
    if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() });
    await sendEmailVerification(cred.user).catch(() => undefined);
  }

  resetPassword(email: string): Promise<void> {
    return sendPasswordResetEmail(this.auth, email.trim());
  }

  async google(): Promise<void> {
    await signInWithPopup(this.auth, new GoogleAuthProvider());
  }

  /** True when the signed-in rider uses email + password (not Google). */
  usesPassword(): boolean {
    return !!this.auth.currentUser?.providerData.some((p) => p.providerId === 'password');
  }

  /**
   * Re-confirms the signed-in rider before signing a document: their password,
   * or the same Google account again. Refreshes the token's auth_time.
   */
  async reconfirm(password?: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) throw Object.assign(new Error('signed-out'), { code: 'auth/user-mismatch' });
    if (this.usesPassword()) {
      if (!password || !user.email) {
        throw Object.assign(new Error('password'), { code: 'auth/missing-password' });
      }
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
    } else {
      await reauthenticateWithPopup(user, new GoogleAuthProvider());
    }
  }
}

export function riderAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-email':
      return 'That email doesn’t look right.';
    case 'auth/missing-password':
      return 'Enter your password.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/user-not-found':
      return 'Wrong email or password.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Sign in instead.';
    case 'auth/weak-password':
      return 'Use at least 8 characters, including a number.';
    case 'auth/account-exists-with-different-credential':
      return 'This email is already used with another sign-in method.';
    case 'auth/user-mismatch':
      return 'Use the same account you signed in with.';
    case 'auth/too-many-requests':
      return 'Too many tries. Wait a while and try again.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Sign-in was cancelled.';
    case 'auth/network-request-failed':
      return 'No connection. Check your internet.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact support.';
    default:
      return 'Couldn’t sign you in. Please try again.';
  }
}
