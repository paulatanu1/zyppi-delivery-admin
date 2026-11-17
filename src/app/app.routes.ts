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
        path: 'reports',
        canActivate: [roleGuard],
        data: { roles: ['finance', 'ops'], heading: 'Overview' },
        title: 'Reports · Zyppi Admin',
        loadComponent: () => import('./features/reports/reports-page').then((m) => m.ReportsPage),
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
        path: 'sellers',
        canActivate: [roleGuard],
        data: { roles: ['ops', 'finance', 'catalog'], heading: 'Operations' },
        title: 'Sellers · Zyppi Admin',
        loadComponent: () => import('./features/sellers/sellers-page').then((m) => m.SellersPage),
      },
      {
        path: 'sellers/:id',
        canActivate: [roleGuard],
        data: { roles: ['ops', 'finance', 'catalog'], heading: 'Operations' },
        title: 'Seller · Zyppi Admin',
        loadComponent: () => import('./features/sellers/sellers-page').then((m) => m.SellersPage),
      },
      {
        path: 'seller-payouts',
        canActivate: [roleGuard],
        data: { roles: ['finance'], heading: 'Money' },
        title: 'Seller payouts · Zyppi Admin',
        loadComponent: () =>
          import('./features/seller-payouts/seller-payouts-page').then((m) => m.SellerPayoutsPage),
      },
      {
        path: 'seller-tax',
        canActivate: [roleGuard],
        data: { roles: ['finance'], heading: 'Money' },
        title: 'Seller tax · Zyppi Admin',
        loadComponent: () =>
          import('./features/seller-tax/seller-tax-page').then((m) => m.SellerTaxPage),
      },
      {
        path: 'seller-plans',
        canActivate: [roleGuard],
        data: { roles: ['finance'], heading: 'Money' },
        title: 'Seller plans · Zyppi Admin',
        loadComponent: () =>
          import('./features/seller-plans/seller-plans-page').then((m) => m.SellerPlansPage),
      },
      {
        path: 'product-requests',
        canActivate: [roleGuard],
        data: { roles: ['catalog'], heading: 'Catalog & growth' },
        title: 'Product requests · Zyppi Admin',
        loadComponent: () =>
          import('./features/product-requests/product-requests-page').then(
            (m) => m.ProductRequestsPage,
          ),
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
            path: 'notifications',
            canActivate: [roleGuard],
            data: { roles: ['catalog'], heading: 'Catalog & growth' },
            title: 'Notifications · Zyppi Admin',
            loadComponent: () =>
              import('./features/notifications/notifications-page').then(
                (m) => m.NotificationsPage,
              ),
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
        path: 'support',
        canActivate: [roleGuard],
        data: { roles: ['support'], heading: 'Operations' },
        title: 'Support · Zyppi Admin',
        loadComponent: () => import('./features/support/support-page').then((m) => m.SupportPage),
      },
      {
        path: 'support/kb',
        canActivate: [roleGuard],
        data: { roles: ['support'], heading: 'Operations' },
        title: 'Knowledge base · Zyppi Admin',
        loadComponent: () => import('./features/support/kb-page').then((m) => m.KbPage),
      },
      {
        path: 'support/:id',
        canActivate: [roleGuard],
        data: { roles: ['support'], heading: 'Operations' },
        title: 'Support · Zyppi Admin',
        loadComponent: () => import('./features/support/support-page').then((m) => m.SupportPage),
      },
      {
        path: 'customers',
        canActivate: [roleGuard],
        data: { roles: ['ops', 'support'], heading: 'Operations' },
        title: 'Customers · Zyppi Admin',
        loadComponent: () =>
          import('./features/customers/customers-page').then((m) => m.CustomersPage),
      },
      {
        path: 'customers/:id',
        canActivate: [roleGuard],
        data: { roles: ['ops', 'support'], heading: 'Operations' },
        title: 'Customer · Zyppi Admin',
        loadComponent: () =>
          import('./features/customers/customers-page').then((m) => m.CustomersPage),
      },
      {
        path: 'dispatch',
        canActivate: [roleGuard],
        data: { roles: ['ops'], heading: 'Operations' },
        title: 'Dispatch · Zyppi Admin',
        loadComponent: () =>
          import('./features/dispatch/dispatch-page').then((m) => m.DispatchPage),
      },
      {
        path: 'rider-settings',
        canActivate: [roleGuard],
        data: { roles: ['ops'], heading: 'Settings' },
        title: 'Rider settings · Zyppi Admin',
        loadComponent: () =>
          import('./features/rider-settings/rider-settings-page').then((m) => m.RiderSettingsPage),
      },
      {
        path: 'rider-payouts',
        canActivate: [roleGuard],
        data: { roles: ['finance'], heading: 'Money' },
        title: 'Rider payouts · Zyppi Admin',
        loadComponent: () =>
          import('./features/rider-payouts/rider-payouts-page').then((m) => m.RiderPayoutsPage),
      },
      {
        path: 'store-settings',
        canActivate: [roleGuard],
        data: { roles: ['ops'], heading: 'Settings' },
        title: 'Store settings · Zyppi Admin',
        loadComponent: () =>
          import('./features/settings/store-settings-page').then((m) => m.StoreSettingsPage),
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
            path: 'legal',
            title: 'Legal documents · Zyppi Admin',
            data: { heading: 'Settings' },
            loadComponent: () => import('./features/legal/legal-page').then((m) => m.LegalPage),
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
