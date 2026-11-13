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
      { label: 'Reports', icon: 'bar-chart', roles: ['finance', 'ops'], phase: 'A7' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Orders', icon: 'shopping', roles: ['ops', 'support'], phase: 'A3' },
      { label: 'Riders', icon: 'car', roles: ['ops'], phase: 'A4' },
      { label: 'Inventory', icon: 'inbox', roles: ['ops', 'catalog'], phase: 'A2' },
      { label: 'Customers', icon: 'team', roles: ['ops', 'support'], phase: 'A8' },
      { label: 'Support', icon: 'message', roles: ['support'], phase: 'A8' },
    ],
  },
  {
    label: 'Catalog & growth',
    items: [
      { label: 'Products', icon: 'tag', roles: ['catalog'], phase: 'A2' },
      { label: 'Categories', icon: 'apartment', roles: ['catalog'], phase: 'A2' },
      { label: 'Banners & home', icon: 'picture', roles: ['catalog'], phase: 'A5' },
      { label: 'Coupons', icon: 'gift', roles: ['catalog', 'finance'], phase: 'A5' },
      { label: 'Notifications', icon: 'notification', roles: ['catalog'], phase: 'A6' },
    ],
  },
  {
    label: 'Money',
    items: [{ label: 'Payments', icon: 'wallet', roles: ['finance'], phase: 'A3' }],
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
      { label: 'Store settings', icon: 'setting', roles: ['ops'], phase: 'A8' },
    ],
  },
];
