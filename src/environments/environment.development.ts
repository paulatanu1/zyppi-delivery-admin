import { baseEnvironment } from './environment.base';

/** `npm start`: dev build against the real project (zippy-app-2024). */
export const environment = { ...baseEnvironment, production: false };
