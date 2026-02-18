export type UserRole = 'owner' | 'accountant' | 'manager' | 'bar' | 'staff' | 'customer' | 'hq';

export type Permission =
  | 'can_count_stock'
  | 'can_manage_deposit'
  | 'can_approve_deposit'
  | 'can_approve_stock'
  | 'can_manage_users'
  | 'can_view_reports'
  | 'can_manage_settings'
  | 'can_transfer'
  | 'can_view_own_deposits'
  | 'can_request_withdrawal'
  | 'can_borrow';

export const ROLE_PERMISSIONS: Record<UserRole, Permission[] | ['*']> = {
  owner: ['*'],
  accountant: ['can_view_reports'],
  manager: ['can_count_stock', 'can_transfer', 'can_view_reports', 'can_borrow'],
  bar: ['can_count_stock', 'can_manage_deposit', 'can_approve_deposit'],
  staff: ['can_count_stock', 'can_manage_deposit', 'can_borrow'],
  customer: ['can_view_own_deposits', 'can_request_withdrawal'],
  hq: ['can_transfer', 'can_view_reports'],
};

export const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'เจ้าของร้าน',
  accountant: 'บัญชี',
  manager: 'ผู้จัดการ',
  bar: 'หัวหน้าบาร์',
  staff: 'พนักงาน',
  customer: 'ลูกค้า',
  hq: 'พนักงานคลังกลาง',
};

export const ROLE_HOME_ROUTES: Record<UserRole, string> = {
  owner: '/overview',
  accountant: '/reports',
  manager: '/store-overview',
  bar: '/bar-approval',
  staff: '/my-tasks',
  customer: '/customer',
  hq: '/hq-warehouse',
};
