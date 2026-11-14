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
    // Public rider sign-up and status ("Ride with Zyppi").
    path: 'rider',
    title: 'Ride with Zyppi',
    loadComponent: () => import('./features/rider-portal/rider-portal').then((m) => m.RiderPortal),
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
        path: 'orders',
        canActivate: [roleGuard],
        data: { roles: ['ops', 'support'], heading: 'Operations' },
        title: 'Orders · Zyppi Admin',
        loadComponent: () => import('./features/orders/orders-page').then((m) => m.OrdersPage),
      },
      {
        path: 'orders/:id',
        canActivate: [roleGuard],
        data: { roles: ['ops', 'support'], heading: 'Operations' },
        title: 'Order · Zyppi Admin',
        loadComponent: () => import('./features/orders/orders-page').then((m) => m.OrdersPage),
      },
      {
        path: 'riders',
        canActivate: [roleGuard],
        data: { roles: ['ops', 'finance'], heading: 'Operations' },
        title: 'Riders · Zyppi Admin',
        loadComponent: () => import('./features/riders/riders-page').then((m) => m.RidersPage),
      },
      {
        path: 'riders/:id',
        canActivate: [roleGuard],
        data: { roles: ['ops', 'finance'], heading: 'Operations' },
        title: 'Rider · Zyppi Admin',
        loadComponent: () => import('./features/riders/riders-page').then((m) => m.RidersPage),
      },
      {
        path: 'payments',
        canActivate: [roleGuard],
        data: { roles: ['finance'], heading: 'Money' },
        title: 'Payments · Zyppi Admin',
        loadComponent: () =>
          import('./features/payments/payments-page').then((m) => m.PaymentsPage),
      },
      {
        path: 'catalog',
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'products' },
          {
            path: 'home',
            canActivate: [roleGuard],
            data: { roles: ['catalog'], heading: 'Catalog & growth' },
            title: 'Banners & home · Zyppi Admin',
            loadComponent: () => import('./features/home/home-page').then((m) => m.HomePage),
          },
          {
            path: 'coupons',
            canActivate: [roleGuard],
            data: { roles: ['catalog', 'finance'], heading: 'Catalog & growth' },
            title: 'Coupons · Zyppi Admin',
            loadComponent: () =>
              import('./features/coupons/coupons-page').then((m) => m.CouponsPage),
          },
          {
            path: 'products',
            canActivate: [roleGuard],
            data: { roles: ['catalog'], heading: 'Catalog' },
            title: 'Products · Zyppi Admin',
            loadComponent: () =>
              import('./features/products/products-page').then((m) => m.ProductsPage),
          },
          {
            path: 'products/import',
            canActivate: [roleGuard],
            data: { roles: ['catalog'], heading: 'Catalog' },
            title: 'Bulk upload · Zyppi Admin',
            loadComponent: () =>
              import('./features/products/import-page').then((m) => m.ImportPage),
          },
          {
            path: 'categories',
            canActivate: [roleGuard],
            data: { roles: ['catalog'], heading: 'Catalog' },
            title: 'Categories · Zyppi Admin',
            loadComponent: () =>
              import('./features/categories/categories-page').then((m) => m.CategoriesPage),
          },
          {
            path: 'inventory',
            canActivate: [roleGuard],
            data: { roles: ['ops', 'catalog'], heading: 'Operations' },
            title: 'Inventory · Zyppi Admin',
            loadComponent: () =>
              import('./features/inventory/inventory-page').then((m) => m.InventoryPage),
          },
        ],
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
          status: '403',
          message: 'Your role can’t open this page. Ask a super admin if you need it.',
        },
        loadComponent: () => import('./features/system/status-page').then((m) => m.StatusPage),
      },
      {
        path: '**',
        title: 'Not found · Zyppi Admin',
        data: {
          heading: 'Page not found',
          status: '404',
          message: 'That page doesn’t exist or has moved.',
        },
        loadComponent: () => import('./features/system/status-page').then((m) => m.StatusPage),
      },
    ],
  },
];
