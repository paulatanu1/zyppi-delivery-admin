import { Injectable, inject } from '@angular/core';
import {
  QueryConstraint,
  QueryDocumentSnapshot,
  Timestamp,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from 'firebase/firestore';
import { FIRESTORE } from '../../core/firebase/firebase';

export interface AuditRow {
  id: string;
  actorUid: string;
  actorEmail: string | null;
  role: string;
  action: string;
  target: string;
  before: unknown;
  after: unknown;
  at: Timestamp | null;
}

export interface AuditPage {
  rows: AuditRow[];
  cursor: QueryDocumentSnapshot | null;
}

export const AUDIT_PAGE_SIZE = 50;

@Injectable({ providedIn: 'root' })
export class AuditApi {
  private readonly db = inject(FIRESTORE);

  /** Newest first; `action` filter needs the (action, at desc) index. */
  async page(action: string | null, after: QueryDocumentSnapshot | null): Promise<AuditPage> {
    const parts: QueryConstraint[] = [];
    if (action) parts.push(where('action', '==', action));
    parts.push(orderBy('at', 'desc'));
    if (after) parts.push(startAfter(after));
    parts.push(limit(AUDIT_PAGE_SIZE));
    const snap = await getDocs(query(collection(this.db, 'auditLogs'), ...parts));
    return {
      rows: snap.docs.map((d) => ({
        id: d.id,
        actorUid: d.get('actorUid') ?? '',
        actorEmail: d.get('actorEmail') ?? null,
        role: d.get('role') ?? '',
        action: d.get('action') ?? '',
        target: d.get('target') ?? '',
        before: d.get('before') ?? null,
        after: d.get('after') ?? null,
        at: d.get('at') instanceof Timestamp ? d.get('at') : null,
      })),
      cursor: snap.docs.length === AUDIT_PAGE_SIZE ? snap.docs[snap.docs.length - 1] : null,
    };
  }
}

export interface Change {
  path: string;
  before: string;
  after: string;
}

/** Flattened field-level differences between two plain values. */
export function diff(before: unknown, after: unknown, path = ''): Change[] {
  const isObj = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);
  if (isObj(before) && isObj(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    return keys.flatMap((k) => diff(before[k], after[k], path ? `${path}.${k}` : k));
  }
  const b = show(before);
  const a = show(after);
  return b === a ? [] : [{ path: path || 'value', before: b, after: a }];
}

function show(v: unknown): string {
  if (v === undefined || v === null) return '—';
  if (typeof v === 'string') return v === '' ? '(empty)' : v;
  return JSON.stringify(v);
}

export const ACTION_LABELS: Record<string, string> = {
  'features.update': 'Changed service switches',
  'staff.setRole': 'Granted or changed a role',
  'staff.removeRole': 'Removed staff access',
};
