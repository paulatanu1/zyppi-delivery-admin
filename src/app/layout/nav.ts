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
      { label: 'Riders', icon: 'car', link: '/riders', roles: ['ops', 'finance'] },
      { label: 'Inventory', icon: 'inbox', link: '/catalog/inventory', roles: ['ops', 'catalog'] },
      { label: 'Customers', icon: 'team', link: '/customers', roles: ['ops', 'support'] },
      { label: 'Support', icon: 'message', link: '/support', roles: ['support'] },
    ],
  },
  {
    label: 'Catalog & growth',
    items: [
      { label: 'Products', icon: 'tag', link: '/catalog/products', roles: ['catalog'] },
      { label: 'Categories', icon: 'apartment', link: '/catalog/categories', roles: ['catalog'] },
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
    items: [{ label: 'Payments', icon: 'wallet', link: '/payments', roles: ['finance'] }],
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
      { label: 'Audit log', icon: 'history', link: '/settings/audit', roles: [] },
      { label: 'Store settings', icon: 'setting', link: '/store-settings', roles: ['ops'] },
    ],
  },
];
