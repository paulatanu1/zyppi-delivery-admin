import { DestroyRef, Signal, computed, inject, signal } from '@angular/core';
import {
  DocumentReference,
  DocumentSnapshot,
  Query,
  QuerySnapshot,
  onSnapshot,
} from 'firebase/firestore';

export type LoadStatus = 'loading' | 'ready' | 'error';

/** A Firestore listener as signals, with retry. Stops when the injector is destroyed. */
export interface Live<T> {
  status: Signal<LoadStatus>;
  value: Signal<T | undefined>;
  error: Signal<string | null>;
  retry(): void;
}

function live<S, T>(
  subscribe: (next: (s: S) => void, fail: (e: Error) => void) => () => void,
  map: (s: S) => T,
): Live<T> {
  const value = signal<T | undefined>(undefined);
  const status = signal<LoadStatus>('loading');
  const error = signal<string | null>(null);
  let stop: (() => void) | null = null;

  const start = () => {
    stop?.();
    status.set('loading');
    error.set(null);
    stop = subscribe(
      (snap) => {
        value.set(map(snap));
        status.set('ready');
      },
      (e) => {
        error.set(friendlyFirestoreError(e));
        status.set('error');
      },
    );
  };

  start();
  inject(DestroyRef).onDestroy(() => stop?.());
  return {
    status: status.asReadonly(),
    value: value.asReadonly(),
    error: error.asReadonly(),
    retry: start,
  };
}

/** Call in an injection context (constructor / field initialiser). */
export function liveDoc<T>(ref: DocumentReference, map: (snap: DocumentSnapshot) => T): Live<T> {
  return live<DocumentSnapshot, T>((next, fail) => onSnapshot(ref, next, fail), map);
}

/** Call in an injection context (constructor / field initialiser). */
export function liveQuery<T>(query: Query, map: (snap: QuerySnapshot) => T): Live<T> {
  return live<QuerySnapshot, T>((next, fail) => onSnapshot(query, next, fail), map);
}

/** True when every listener is ready (for pages that need several). */
export function allReady(...lives: Live<unknown>[]): Signal<LoadStatus> {
  return computed(() => {
    const s = lives.map((l) => l.status());
    return s.includes('error') ? 'error' : s.includes('loading') ? 'loading' : 'ready';
  });
}

export function friendlyFirestoreError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  if (code.endsWith('permission-denied')) return 'Your role can’t see this data.';
  if (code.endsWith('unavailable')) return 'Can’t reach the server. Check your connection.';
  return 'Couldn’t load this. Please try again.';
}
