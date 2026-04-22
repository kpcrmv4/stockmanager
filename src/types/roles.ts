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
  | 'can_borrow'
  | 'can_manage_commission';

export const ROLE_PERMISSIONS: Record<UserRole, Permission[] | ['*']> = {
  owner: ['*'],
  // Account = ใช้ได้หมดเลย ดูข้ามสาขา
  accountant: ['*'],
  // Manager = คนคุมร้าน ดูได้เฉพาะในสาขา ทุกเมนู
  manager: [
    'can_count_stock',
    'can_approve_stock',
    'can_manage_deposit',
    'can_approve_deposit',
    'can_transfer',
    'can_borrow',
    'can_view_reports',
    'can_manage_commission',
  ],
  // Bar = นับสต๊อค เช็คสต๊อค ฝากเหล้า ยืม เบิกเหล้า โอนคลังกลางที่หมดอายุ แชท
  bar: [
    'can_count_stock',
    'can_approve_stock',
    'can_manage_deposit',
    'can_approve_deposit',
    'can_borrow',
    'can_transfer',
  ],
  // Staff = ฝากเหล้า / เบิกเหล้า / แชท
  staff: ['can_manage_deposit'],
  customer: ['can_view_own_deposits', 'can_request_withdrawal'],
  hq: ['can_transfer', 'can_view_reports'],
};

export const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'เจ้าของร้าน',
  accountant: 'บัญชี',
  manager: 'คนคุมร้าน',
  bar: 'บาร์',
  staff: 'พนักงาน',
  customer: 'ลูกค้า',
  hq: 'พนักงานคลังกลาง',
};

/** Translation keys for role labels — use with useTranslations() */
export const ROLE_LABEL_KEYS: Record<UserRole, string> = {
  owner: 'roles.owner',
  accountant: 'roles.accountant',
  manager: 'roles.manager',
  bar: 'roles.bar',
  staff: 'roles.staff',
  customer: 'roles.customer',
  hq: 'roles.hq',
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
