import { Injectable, computed, inject, signal } from '@angular/core';
import {
  MultiFactorResolver,
  TotpMultiFactorGenerator,
  TotpSecret,
  User,
  browserLocalPersistence,
  getMultiFactorResolver,
  multiFactor,
  sendEmailVerification,
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
  phoneNumber: string | null;
  role: Role | null;
  /** Approved delivery partner (custom claim set by adminReviewRider). */
  rider: boolean;
  /** "totp" when this session was signed in with the authenticator code. */
  secondFactor: string | null;
  /** The account has an authenticator app enrolled. */
  mfaEnrolled: boolean;
}

/** A started authenticator enrolment: show the key, then confirm a code. */
export interface TotpEnrolment {
  secret: TotpSecret;
  /** Base32 key to type into the authenticator app. */
  secretKey: string;
  /** otpauth:// link (opens the authenticator app on a phone). */
  url: string;
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

  /** Pending second step of a sign-in (account with an authenticator). */
  private resolver: MultiFactorResolver | null = null;

  /**
   * Signs in and rejects accounts without an admin role. Throws
   * [MfaRequiredError] when the account has an authenticator: finish with
   * [verifyTotp].
   */
  async signIn(email: string, password: string): Promise<Session> {
    await setPersistence(this.auth, browserLocalPersistence);
    this.resolver = null;
    try {
      const cred = await signInWithEmailAndPassword(this.auth, email.trim(), password);
      return await this.finish(cred.user);
    } catch (e) {
      if ((e as { code?: string }).code === 'auth/multi-factor-auth-required') {
        this.resolver = getMultiFactorResolver(this.auth, e as never);
        throw new MfaRequiredError();
      }
      throw e;
    }
  }

  /** Second step: the 6-digit code from the authenticator app. */
  async verifyTotp(code: string): Promise<Session> {
    const resolver = this.resolver;
    const hint = resolver?.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID);
    if (!resolver || !hint) throw new Error('no-pending-sign-in');
    const assertion = TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code.trim());
    const cred = await resolver.resolveSignIn(assertion);
    this.resolver = null;
    return this.finish(cred.user);
  }

  private async finish(user: User): Promise<Session> {
    // Force-refresh so a role granted since the last sign-in is picked up.
    const session = await toSession(user, true);
    if (!session.role) {
      await signOut(this.auth);
      throw new NotAdminError();
    }
    this._session.set(session);
    return session;
  }

  /** Starts adding an authenticator app (needs a recent sign-in). */
  async startTotpEnrolment(): Promise<TotpEnrolment> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('signed-out');
    const secret = await TotpMultiFactorGenerator.generateSecret(
      await multiFactor(user).getSession(),
    );
    return {
      secret,
      secretKey: secret.secretKey,
      url: secret.generateQrCodeUrl(user.email ?? 'staff', 'Zyppi Admin'),
    };
  }

  /** Confirms the enrolment with a code from the app. */
  async finishTotpEnrolment(e: TotpEnrolment, code: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('signed-out');
    const assertion = TotpMultiFactorGenerator.assertionForEnrollment(e.secret, code.trim());
    await multiFactor(user).enroll(assertion, 'Authenticator app');
    this._session.set(await toSession(user, true));
  }

  /** 2-step sign-in needs a verified email: sends the link. */
  async sendVerificationEmail(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('signed-out');
    await sendEmailVerification(user);
  }

  /** Removes the authenticator (needs a recent sign-in). */
  async removeTotp(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('signed-out');
    for (const f of multiFactor(user).enrolledFactors) {
      await multiFactor(user).unenroll(f);
    }
    this._session.set(await toSession(user, true));
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

/** The account has an authenticator: ask for its code. */
export class MfaRequiredError extends Error {
  constructor() {
    super('mfa-required');
  }
}

async function toSession(user: User, forceRefresh = false): Promise<Session> {
  const token = await user.getIdTokenResult(forceRefresh);
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    phoneNumber: user.phoneNumber,
    role: roleFromClaims(token.claims),
    rider: token.claims['rider'] === true,
    secondFactor: token.signInSecondFactor ?? null,
    mfaEnrolled: multiFactor(user).enrolledFactors.length > 0,
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
    case 'auth/invalid-verification-code':
      return 'That code isn’t right. Use the current code from your authenticator app.';
    case 'auth/requires-recent-login':
      return 'For your security, sign out and in again, then retry.';
    case 'auth/operation-not-allowed':
    case 'auth/admin-restricted-operation':
    case 'auth/unsupported-first-factor':
      return '2-step sign-in isn’t switched on for this project yet. Ask the project owner.';
    case 'auth/unverified-email':
      return 'Verify your email first: we can send you a link. Then sign in again and retry.';
    case 'auth/maximum-second-factor-count-exceeded':
      return 'An authenticator is already set up on this account.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
