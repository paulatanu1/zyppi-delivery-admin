/**
 * Admin roles, carried as the Firebase Auth custom claim `role`. The old
 * `admin: true` claim (functions/scripts/set-admin.ts) maps to super_admin
 * until every admin is migrated with `adminSetRole`.
 */
export const ROLES = ['super_admin', 'ops', 'catalog', 'support', 'finance'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super admin',
  ops: 'Operations',
  catalog: 'Catalog',
  support: 'Support',
  finance: 'Finance',
};

export function roleFromClaims(claims: Record<string, unknown>): Role | null {
  const role = claims['role'];
  if (typeof role === 'string' && (ROLES as readonly string[]).includes(role)) {
    return role as Role;
  }
  return claims['admin'] === true ? 'super_admin' : null;
}

/** super_admin can do everything; others only what `allowed` lists. */
export function hasRole(role: Role | null, allowed: readonly Role[]): boolean {
  if (!role) return false;
  return role === 'super_admin' || allowed.includes(role);
}
