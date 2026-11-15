import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';
import { FirebaseApp, initializeApp } from 'firebase/app';
import { ReCaptchaEnterpriseProvider, initializeAppCheck } from 'firebase/app-check';
import { Auth, connectAuthEmulator, getAuth } from 'firebase/auth';
import { Firestore, connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { Functions, connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { FirebaseStorage, connectStorageEmulator, getStorage } from 'firebase/storage';
import { environment } from '../../../environments/environment';

export const FIREBASE_APP = new InjectionToken<FirebaseApp>('FIREBASE_APP');
export const FIREBASE_AUTH = new InjectionToken<Auth>('FIREBASE_AUTH');
export const FIRESTORE = new InjectionToken<Firestore>('FIRESTORE');
export const FUNCTIONS = new InjectionToken<Functions>('FUNCTIONS');
export const STORAGE = new InjectionToken<FirebaseStorage>('STORAGE');

/**
 * The Firebase JS SDK behind Angular DI tokens. Features never import
 * `firebase/*` directly in components — only in their `*.api.ts` service.
 */
export function provideFirebase(): EnvironmentProviders {
  const app = initializeApp(environment.firebase);
  // App Check: callables and Firestore get a token proving the call comes
  // from this site (functions/src/shared/hardening.ts). Dev builds use a
  // debug token printed in the browser console once; register it under
  // App Check → Apps → Manage debug tokens.
  if (environment.appCheckSiteKey && !environment.useEmulators) {
    if (!environment.production) {
      (globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
        true;
    }
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(environment.appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }
  const auth = getAuth(app);
  const db = getFirestore(app);
  const functions = getFunctions(app, environment.functionsRegion);
  const storage = getStorage(app);

  if (environment.useEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    connectStorageEmulator(storage, '127.0.0.1', 9199);
  }

  return makeEnvironmentProviders([
    { provide: FIREBASE_APP, useValue: app },
    { provide: FIREBASE_AUTH, useValue: auth },
    { provide: FIRESTORE, useValue: db },
    { provide: FUNCTIONS, useValue: functions },
    { provide: STORAGE, useValue: storage },
  ]);
}
