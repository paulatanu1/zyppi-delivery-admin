import { Injectable, computed, inject, signal } from '@angular/core';
import {
  User,
  browserLocalPersistence,
  onIdTokenChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { FIREBASE_AUTH } from '../firebase/firebase';
import { Role, roleFromClaims } from './roles';

export interface Session {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: Role | null;
}

/**
 * Admin session as signals. `ready` turns true once Firebase has restored
 * (or not) the persisted sign-in, so guards can wait for it.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(FIREBASE_AUTH);

  private readonly _session = signal<Session | null>(null);
  private readonly _ready = signal(false);
  private readyResolve!: () => void;
  private readonly readyPromise = new Promise<void>((r) => (this.readyResolve = r));

  readonly session = this._session.asReadonly();
  readonly ready = this._ready.asReadonly();
  readonly role = computed(() => this._session()?.role ?? null);
  readonly isAdmin = computed(() => this.role() !== null);

  constructor() {
    onIdTokenChanged(this.auth, async (user) => {
      try {
        this._session.set(user ? await toSession(user) : null);
      } catch {
        // The saved sign-in is no longer valid (access removed, account
        // disabled or deleted, tokens revoked): start from the login page
        // instead of hanging on a blank screen.
        this._session.set(null);
        await signOut(this.auth).catch(() => undefined);
      } finally {
        if (!this._ready()) {
          this._ready.set(true);
          this.readyResolve();
        }
      }
    });
  }

  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  /** Signs in and rejects accounts without an admin role. */
  async signIn(email: string, password: string): Promise<Session> {
    await setPersistence(this.auth, browserLocalPersistence);
    const cred = await signInWithEmailAndPassword(this.auth, email.trim(), password);
    // Force-refresh so a role granted since the last sign-in is picked up.
    const session = await toSession(cred.user, true);
    if (!session.role) {
      await signOut(this.auth);
      throw new NotAdminError();
    }
    this._session.set(session);
    return session;
  }

  resetPassword(email: string): Promise<void> {
    return sendPasswordResetEmail(this.auth, email.trim());
  }

  signOut(): Promise<void> {
    return signOut(this.auth);
  }
}

export class NotAdminError extends Error {
  constructor() {
    super('not-admin');
  }
}

async function toSession(user: User, forceRefresh = false): Promise<Session> {
  const token = await user.getIdTokenResult(forceRefresh);
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    role: roleFromClaims(token.claims),
  };
}

/** Friendly text for Firebase Auth error codes. */
export function authErrorMessage(err: unknown): string {
  if (err instanceof NotAdminError) {
    return 'This account has no admin access. Ask a super admin to grant you a role.';
  }
  const code = (err as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-email':
      return 'That email address doesn’t look right.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Wrong email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a few minutes and try again.';
    case 'auth/network-request-failed':
      return 'No connection. Check your internet and try again.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
