import type { UserRole, Permission } from '@/types/roles';
import type { AuthUser } from '@/lib/auth/permissions';

export interface ModuleConfig {
  id: string;
  nameKey: string;
  descriptionKey: string;
  icon: string;
  color: string; // tailwind color name
  href: string;
  roles: UserRole[];
  permission?: Permission;
  badge?: 'pending_count';
  groupKey: string;
}

export const modules: ModuleConfig[] = [
  // ─── หลัก ───
  {
    id: 'overview',
    nameKey: 'modules.overview.name',
    descriptionKey: 'modules.overview.description',
    icon: 'layout-dashboard',
    color: 'violet',
    href: '/overview',
    roles: ['owner', 'accountant', 'manager', 'hq'],
    groupKey: 'moduleGroups.main',
  },
  {
    id: 'chat',
    nameKey: 'modules.chat.name',
    descriptionKey: 'modules.chat.description',
    icon: 'message-circle',
    color: 'blue',
    href: '/chat',
    roles: ['owner', 'accountant', 'manager', 'bar', 'staff', 'hq'],
    groupKey: 'moduleGroups.main',
  },

  // ─── คลังสินค้า ───
  {
    id: 'stock',
    nameKey: 'modules.stock.name',
    descriptionKey: 'modules.stock.description',
    icon: 'clipboard-check',
    color: 'indigo',
    href: '/stock',
    roles: ['owner', 'accountant', 'manager', 'bar'],
    permission: 'can_count_stock',
    groupKey: 'moduleGroups.warehouse',
  },
  {
    id: 'deposit',
    nameKey: 'modules.deposit.name',
    descriptionKey: 'modules.deposit.description',
    icon: 'wine',
    color: 'emerald',
    href: '/deposit',
    roles: ['owner', 'accountant', 'manager', 'bar', 'staff'],
    permission: 'can_manage_deposit',
    groupKey: 'moduleGroups.warehouse',
  },
  {
    id: 'transfer',
    nameKey: 'modules.transfer.name',
    descriptionKey: 'modules.transfer.description',
    icon: 'arrow-left-right',
    color: 'blue',
    href: '/transfer',
    roles: ['owner', 'accountant', 'manager', 'bar'],
    permission: 'can_transfer',
    groupKey: 'moduleGroups.warehouse',
  },
  {
    id: 'borrow',
    nameKey: 'modules.borrow.name',
    descriptionKey: 'modules.borrow.description',
    icon: 'shuffle',
    color: 'rose',
    href: '/borrow',
    roles: ['owner', 'accountant', 'manager', 'bar'],
    permission: 'can_borrow',
    groupKey: 'moduleGroups.warehouse',
  },
  {
    id: 'hq-warehouse',
    nameKey: 'modules.hqWarehouse.name',
    descriptionKey: 'modules.hqWarehouse.description',
    icon: 'warehouse',
    color: 'teal',
    href: '/hq-warehouse',
    roles: ['owner', 'hq'],
    permission: 'can_transfer',
    groupKey: 'moduleGroups.warehouse',
  },

  // ─── คอมมิชชั่น ───
  {
    id: 'commission',
    nameKey: 'modules.commission.name',
    descriptionKey: 'modules.commission.description',
    icon: 'hand-coins',
    color: 'amber',
    href: '/commission',
    roles: ['owner', 'accountant', 'manager'],
    permission: 'can_manage_commission',
    groupKey: 'moduleGroups.warehouse',
  },

  // ─── รายงาน ───
  {
    id: 'reports',
    nameKey: 'modules.reports.name',
    descriptionKey: 'modules.reports.description',
    icon: 'file-bar-chart',
    color: 'amber',
    href: '/reports',
    roles: ['owner', 'accountant', 'manager'],
    permission: 'can_view_reports',
    groupKey: 'moduleGroups.reports',
  },
  {
    id: 'activity',
    nameKey: 'modules.activity.name',
    descriptionKey: 'modules.activity.description',
    icon: 'shield-check',
    color: 'cyan',
    href: '/activity',
    roles: ['owner'],
    permission: 'can_manage_settings',
    groupKey: 'moduleGroups.reports',
  },

  // ─── วิเคราะห์ ───
  {
    id: 'performance-staff',
    nameKey: 'modules.performanceStaff.name',
    descriptionKey: 'modules.performanceStaff.description',
    icon: 'trophy',
    color: 'amber',
    href: '/performance/staff',
    roles: ['owner'],
    permission: 'can_view_reports',
    groupKey: 'moduleGroups.analytics',
  },
  {
    id: 'performance-stores',
    nameKey: 'modules.performanceStores.name',
    descriptionKey: 'modules.performanceStores.description',
    icon: 'scale',
    color: 'indigo',
    href: '/performance/stores',
    roles: ['owner'],
    permission: 'can_view_reports',
    groupKey: 'moduleGroups.analytics',
  },
  {
    id: 'performance-operations',
    nameKey: 'modules.performanceOperations.name',
    descriptionKey: 'modules.performanceOperations.description',
    icon: 'zap',
    color: 'rose',
    href: '/performance/operations',
    roles: ['owner'],
    permission: 'can_view_reports',
    groupKey: 'moduleGroups.analytics',
  },
  {
    id: 'performance-customers',
    nameKey: 'modules.performanceCustomers.name',
    descriptionKey: 'modules.performanceCustomers.description',
    icon: 'pie-chart',
    color: 'emerald',
    href: '/performance/customers',
    roles: ['owner'],
    permission: 'can_view_reports',
    groupKey: 'moduleGroups.analytics',
  },

  // ─── ช่วยเหลือ ───
  {
    id: 'guide',
    nameKey: 'modules.guide.name',
    descriptionKey: 'modules.guide.description',
    icon: 'book-open',
    color: 'sky',
    href: '/guide',
    roles: ['owner', 'accountant', 'manager', 'bar', 'staff', 'hq'],
    groupKey: 'moduleGroups.help',
  },

  // ─── ระบบ ───
  {
    id: 'announcements',
    nameKey: 'modules.announcements.name',
    descriptionKey: 'modules.announcements.description',
    icon: 'megaphone',
    color: 'pink',
    href: '/announcements',
    roles: ['owner'],
    permission: 'can_manage_settings',
    groupKey: 'moduleGroups.system',
  },
  {
    id: 'users',
    nameKey: 'modules.users.name',
    descriptionKey: 'modules.users.description',
    icon: 'user-cog',
    color: 'orange',
    href: '/users',
    roles: ['owner'],
    permission: 'can_manage_users',
    groupKey: 'moduleGroups.system',
  },
  {
    id: 'settings',
    nameKey: 'modules.settings.name',
    descriptionKey: 'modules.settings.description',
    icon: 'settings',
    color: 'gray',
    href: '/settings',
    roles: ['owner'],
    permission: 'can_manage_settings',
    groupKey: 'moduleGroups.system',
  },
];

export function getModulesForRole(role: UserRole): ModuleConfig[] {
  return modules.filter((m) => m.roles.includes(role));
}

/**
 * คืนโมดูลทั้งหมดที่ผู้ใช้คนนี้เข้าถึงได้ โดยรวม:
 * 1. Role-based access: ถ้า user.role อยู่ใน module.roles
 * 2. Individual permission override: ถ้า module.permission ถูกประกาศไว้
 *    และผู้ใช้ได้รับ permission นั้นแบบรายบุคคล (user.permissions)
 *
 * Owner (role มี '*' wildcard) เห็นทุกโมดูลอยู่แล้วผ่าน role check
 */
export function getAccessibleModules(user: AuthUser): ModuleConfig[] {
  return modules.filter((m) => {
    // 1) role-based access — พฤติกรรมเดิม
    if (m.roles.includes(user.role)) return true;
    // 2) individual permission unlock — ต้องประกาศ permission ไว้
    if (m.permission && user.permissions.includes(m.permission)) return true;
    return false;
  });
}
