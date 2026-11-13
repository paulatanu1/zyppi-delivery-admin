import { Role } from '../core/auth/roles';

export interface NavItem {
  label: string;
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
      { label: 'Dashboard', icon: 'pi pi-th-large', link: '/dashboard', roles: ALL },
      { label: 'Reports', icon: 'pi pi-chart-bar', roles: ['finance', 'ops'], phase: 'A7' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Orders', icon: 'pi pi-shopping-bag', roles: ['ops', 'support'], phase: 'A3' },
      { label: 'Riders', icon: 'pi pi-truck', roles: ['ops'], phase: 'A4' },
      { label: 'Inventory', icon: 'pi pi-box', roles: ['ops', 'catalog'], phase: 'A2' },
      { label: 'Customers', icon: 'pi pi-users', roles: ['ops', 'support'], phase: 'A8' },
      { label: 'Support', icon: 'pi pi-comments', roles: ['support'], phase: 'A8' },
    ],
  },
  {
    label: 'Catalog & growth',
    items: [
      { label: 'Products', icon: 'pi pi-tag', roles: ['catalog'], phase: 'A2' },
      { label: 'Categories', icon: 'pi pi-sitemap', roles: ['catalog'], phase: 'A2' },
      { label: 'Banners & home', icon: 'pi pi-images', roles: ['catalog'], phase: 'A5' },
      { label: 'Coupons', icon: 'pi pi-ticket', roles: ['catalog', 'finance'], phase: 'A5' },
      { label: 'Notifications', icon: 'pi pi-megaphone', roles: ['catalog'], phase: 'A6' },
    ],
  },
  {
    label: 'Money',
    items: [{ label: 'Payments', icon: 'pi pi-wallet', roles: ['finance'], phase: 'A3' }],
  },
  {
    label: 'System',
    items: [
      { label: 'Settings', icon: 'pi pi-cog', roles: [], phase: 'A1' },
      { label: 'Admins & roles', icon: 'pi pi-shield', roles: [], phase: 'A1' },
      { label: 'Audit log', icon: 'pi pi-history', roles: [], phase: 'A1' },
    ],
  },
];
