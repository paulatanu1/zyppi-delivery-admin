import { Routes } from '@angular/router';
import { adminGuard, guestGuard, roleGuard } from './core/auth/guards';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    title: 'Sign in · Zyppi Admin',
    loadComponent: () => import('./features/auth/login').then((m) => m.Login),
  },
  {
    path: '',
    canActivate: [adminGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'Dashboard · Zyppi Admin',
        data: { heading: 'Dashboard' },
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'settings',
        canActivate: [roleGuard],
        data: { roles: [] }, // super_admin only
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'services' },
          {
            path: 'services',
            title: 'Services & switches · Zyppi Admin',
            data: { heading: 'Settings' },
            loadComponent: () =>
              import('./features/settings/services-page').then((m) => m.ServicesPage),
          },
          {
            path: 'staff',
            title: 'Admins & roles · Zyppi Admin',
            data: { heading: 'Settings' },
            loadComponent: () => import('./features/staff/staff-page').then((m) => m.StaffPage),
          },
          {
            path: 'audit',
            title: 'Audit log · Zyppi Admin',
            data: { heading: 'Settings' },
            loadComponent: () => import('./features/audit/audit-page').then((m) => m.AuditPage),
          },
        ],
      },
      {
        path: 'forbidden',
        title: 'No access · Zyppi Admin',
        data: {
          heading: 'No access',
          icon: 'pi pi-lock',
          message: 'Your role can’t open this page. Ask a super admin if you need it.',
        },
        loadComponent: () => import('./features/system/status-page').then((m) => m.StatusPage),
      },
      {
        path: '**',
        title: 'Not found · Zyppi Admin',
        data: {
          heading: 'Page not found',
          icon: 'pi pi-compass',
          message: 'That page doesn’t exist or has moved.',
        },
        loadComponent: () => import('./features/system/status-page').then((m) => m.StatusPage),
      },
    ],
  },
];
