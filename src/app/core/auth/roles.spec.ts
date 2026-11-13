import { hasRole, roleFromClaims } from './roles';

describe('roleFromClaims', () => {
  it('reads a valid role claim', () => {
    expect(roleFromClaims({ role: 'ops' })).toBe('ops');
  });

  it('maps the legacy admin claim to super_admin', () => {
    expect(roleFromClaims({ admin: true })).toBe('super_admin');
  });

  it('prefers role over the legacy claim', () => {
    expect(roleFromClaims({ admin: true, role: 'finance' })).toBe('finance');
  });

  it('rejects unknown roles and customers', () => {
    expect(roleFromClaims({ role: 'rider' })).toBeNull();
    expect(roleFromClaims({})).toBeNull();
  });
});

describe('hasRole', () => {
  it('lets super_admin through everything', () => {
    expect(hasRole('super_admin', ['finance'])).toBe(true);
  });

  it('checks the allowed list for other roles', () => {
    expect(hasRole('ops', ['ops', 'support'])).toBe(true);
    expect(hasRole('catalog', ['finance'])).toBe(false);
    expect(hasRole(null, ['ops'])).toBe(false);
  });
});
