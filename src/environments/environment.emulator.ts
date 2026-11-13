import { baseEnvironment } from './environment.base';

/**
 * `npm run start:emulator`: only the local emulators started from zyppi-APP
 * (Auth 9099, Firestore 8080, Functions 5001, Storage 9199).
 */
export const environment = { ...baseEnvironment, production: false, useEmulators: true };
