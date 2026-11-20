import { Role } from '../core/auth/roles';

export interface NavItem {
  label: string;
  /** NG-ZORRO (Ant Design) outline icon name, registered in core/theme/icons.ts. */
  icon: string;
  /** Router link; absent while the module is still being built. */
  link?: string;
  /** Roles that see it (super_admin always does). */
  roles: readonly Role[];
  /** Build phase from docs/PLAN.md, shown as "Soon" until `link` exists. */
  phase?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const ALL: readonly Role[] = ['ops', 'catalog', 'support', 'finance'];

export const NAV: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', icon: 'dashboard', link: '/dashboard', roles: ALL },
      { label: 'Reports', icon: 'bar-chart', link: '/reports', roles: ['finance', 'ops'] },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Orders', icon: 'shopping', link: '/orders', roles: ['ops', 'support'] },
      { label: 'Dispatch', icon: 'thunderbolt', link: '/dispatch', roles: ['ops'] },
      { label: 'Riders', icon: 'car', link: '/riders', roles: ['ops', 'finance'] },
      { label: 'Sellers', icon: 'shop', link: '/sellers', roles: ['ops', 'finance', 'catalog'] },
      { label: 'Inventory', icon: 'inbox', link: '/catalog/inventory', roles: ['ops', 'catalog'] },
      {
        label: 'Returns',
        icon: 'swap',
        link: '/returns',
        roles: ['ops', 'support', 'finance'],
      },
      {
        label: 'Claims',
        icon: 'alert',
        link: '/claims',
        roles: ['ops', 'support', 'finance'],
      },
      {
        label: 'Customers',
        icon: 'team',
        link: '/customers',
        roles: ['ops', 'support', 'finance'],
      },
      { label: 'Support', icon: 'message', link: '/support', roles: ['support'] },
    ],
  },
  {
    label: 'Catalog & growth',
    items: [
      { label: 'Products', icon: 'tag', link: '/catalog/products', roles: ['catalog'] },
      { label: 'Categories', icon: 'apartment', link: '/catalog/categories', roles: ['catalog'] },
      {
        label: 'Search insights',
        icon: 'search',
        link: '/search-insights',
        roles: ['catalog', 'ops'],
      },
      {
        label: 'Product requests',
        icon: 'file-search',
        link: '/product-requests',
        roles: ['catalog'],
      },
      { label: 'Banners & home', icon: 'picture', link: '/catalog/home', roles: ['catalog'] },
      {
        label: 'Coupons',
        icon: 'gift',
        link: '/catalog/coupons',
        roles: ['catalog', 'finance'],
      },
      {
        label: 'Notifications',
        icon: 'notification',
        link: '/catalog/notifications',
        roles: ['catalog'],
      },
    ],
  },
  {
    label: 'Money',
    items: [
      { label: 'Payments', icon: 'wallet', link: '/payments', roles: ['finance'] },
      { label: 'Rider payouts', icon: 'credit-card', link: '/rider-payouts', roles: ['finance'] },
      { label: 'Seller payouts', icon: 'credit-card', link: '/seller-payouts', roles: ['finance'] },
      {
        label: 'Seller tax (TCS/TDS)',
        icon: 'file-excel',
        link: '/seller-tax',
        roles: ['finance'],
      },
      { label: 'Seller plans', icon: 'profile', link: '/seller-plans', roles: ['finance'] },
    ],
  },
  {
    label: 'System',
    items: [
      {
        label: 'Services & switches',
        icon: 'control',
        link: '/settings/services',
        roles: [],
      },
      { label: 'Admins & roles', icon: 'safety-certificate', link: '/settings/staff', roles: [] },
      { label: 'Legal documents', icon: 'file-protect', link: '/settings/legal', roles: [] },
      { label: 'Audit log', icon: 'history', link: '/settings/audit', roles: [] },
      { label: 'Store settings', icon: 'setting', link: '/store-settings', roles: ['ops'] },
      { label: 'Rider settings', icon: 'tool', link: '/rider-settings', roles: ['ops'] },
    ],
  },
];
