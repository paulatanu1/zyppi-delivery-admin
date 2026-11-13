import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { Role, hasRole } from './roles';

/** Signed-in admin, otherwise to /login?next=… */
export const adminGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady();
  if (auth.isAdmin()) return true;
  return router.createUrlTree(['/login'], { queryParams: { next: state.url } });
};

/** Signed-in admins skip the login page. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady();
  return auth.isAdmin() ? router.createUrlTree(['/']) : true;
};

/** Route `data: { roles: [...] }`; super_admin always passes. */
export const roleGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady();
  const roles = (route.data['roles'] as Role[] | undefined) ?? [];
  return hasRole(auth.role(), roles) ? true : router.createUrlTree(['/forbidden']);
};
