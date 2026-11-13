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

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  super_admin: 'Everything, including settings, staff and the audit log',
  ops: 'Orders, riders, stores, delivery slots and stock',
  catalog: 'Products, categories, banners, coupons and notifications',
  support: 'Support inbox, knowledge base and customers',
  finance: 'Payments, refunds, coupons and reports',
};

export function roleFromClaims(claims: Record<string, unknown>): Role | null {
  const role = claims['role'];
  if (isRole(role)) return role;
  return claims['admin'] === true ? 'super_admin' : null;
}

/** super_admin can do everything; others only what `allowed` lists. */
export function hasRole(role: Role | null, allowed: readonly Role[]): boolean {
  if (!role) return false;
  return role === 'super_admin' || allowed.includes(role);
}
