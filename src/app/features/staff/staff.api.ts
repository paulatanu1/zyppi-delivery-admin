import { Injectable, inject } from '@angular/core';
import { Timestamp, collection, orderBy, query } from 'firebase/firestore';
import { Role, isRole } from '../../core/auth/roles';
import { Callables } from '../../core/firebase/callable';
import { FIRESTORE } from '../../core/firebase/firebase';
import { Live, liveQuery } from '../../core/firebase/live';

export interface StaffMember {
  uid: string;
  email: string;
  displayName: string | null;
  role: Role;
  disabled: boolean;
  updatedAt: Timestamp | null;
  updatedBy: string | null;
}

@Injectable({ providedIn: 'root' })
export class StaffApi {
  private readonly db = inject(FIRESTORE);
  private readonly callables = inject(Callables);

  /** Injection context only. staff/{uid} is the mirror kept by adminSetRole. */
  watchStaff(): Live<StaffMember[]> {
    return liveQuery(query(collection(this.db, 'staff'), orderBy('email')), (s) =>
      s.docs
        .map((d) => {
          const role = d.get('role');
          if (!isRole(role)) return null;
          const at = d.get('updatedAt');
          return {
            uid: d.id,
            email: (d.get('email') as string) ?? '',
            displayName: (d.get('displayName') as string | null) ?? null,
            role,
            disabled: d.get('disabled') === true,
            updatedAt: at instanceof Timestamp ? at : null,
            updatedBy: (d.get('updatedBy') as string | null) ?? null,
          } satisfies StaffMember;
        })
        .filter((m): m is StaffMember => m !== null),
    );
  }

  /** role = null removes access (and signs them out within the hour). */
  setRole(email: string, role: Role | null): Promise<{ uid: string; role: Role | null }> {
    return this.callables.call('adminSetRole', { email, role });
  }
}
