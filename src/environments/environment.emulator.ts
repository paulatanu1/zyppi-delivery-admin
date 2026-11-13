import { baseEnvironment } from './environment.base';

/**
 * `npm run start:emulator`: only the local emulators started from zyppi-APP
 * (Auth 9099, Firestore 8080, Functions 5001, Storage 9199) under the
 * `demo-zyppi` project, so nothing can reach production by accident:
 *   firebase emulators:start --project demo-zyppi
 */
export const environment = {
  ...baseEnvironment,
  production: false,
  useEmulators: true,
  firebase: { ...baseEnvironment.firebase, projectId: 'demo-zyppi' },
};
