import type { UserRole, Permission } from '@/types/roles';

export interface ModuleConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string; // tailwind color name
  href: string;
  roles: UserRole[];
  permission?: Permission;
  badge?: 'pending_count';
  group: string;
}

export const modules: ModuleConfig[] = [
  // ─── หลัก ───
  {
    id: 'overview',
    name: 'ภาพรวม',
    description: 'แดชบอร์ดภาพรวมระบบ',
    icon: 'layout-dashboard',
    color: 'violet',
    href: '/overview',
    roles: ['owner', 'accountant', 'manager', 'hq'],
    group: 'หลัก',
  },
  {
    id: 'chat',
    name: 'แชท',
    description: 'แชทภายในสาขาและระบบ Claim งาน',
    icon: 'message-circle',
    color: 'blue',
    href: '/chat',
    roles: ['owner', 'accountant', 'manager', 'bar', 'staff', 'hq'],
    group: 'หลัก',
  },

  // ─── คลังสินค้า ───
  {
    id: 'stock',
    name: 'เช็คสต๊อก',
    description: 'นับสต๊อก เปรียบเทียบ อธิบายผลต่าง',
    icon: 'clipboard-check',
    color: 'indigo',
    href: '/stock',
    roles: ['owner', 'manager', 'bar', 'staff'],
    permission: 'can_count_stock',
    group: 'คลังสินค้า',
  },
  {
    id: 'deposit',
    name: 'ฝาก/เบิกเหล้า',
    description: 'จัดการฝากเหล้าและเบิกเหล้า',
    icon: 'wine',
    color: 'emerald',
    href: '/deposit',
    roles: ['owner', 'bar', 'staff'],
    permission: 'can_manage_deposit',
    group: 'คลังสินค้า',
  },
  {
    id: 'transfer',
    name: 'โอนสต๊อก',
    description: 'โอนสต๊อกระหว่างสาขา',
    icon: 'arrow-left-right',
    color: 'blue',
    href: '/transfer',
    roles: ['owner', 'manager'],
    permission: 'can_transfer',
    group: 'คลังสินค้า',
  },
  {
    id: 'borrow',
    name: 'ยืมสินค้า',
    description: 'ยืมสินค้าระหว่างสาขา',
    icon: 'shuffle',
    color: 'rose',
    href: '/borrow',
    roles: ['owner', 'manager', 'staff'],
    permission: 'can_borrow',
    group: 'คลังสินค้า',
  },
  {
    id: 'hq-warehouse',
    name: 'คลังกลาง',
    description: 'รับโอนเหล้าหมดอายุ จำหน่ายออก',
    icon: 'warehouse',
    color: 'teal',
    href: '/hq-warehouse',
    roles: ['owner', 'hq'],
    permission: 'can_transfer',
    group: 'คลังสินค้า',
  },

  // ─── รายงาน ───
  {
    id: 'reports',
    name: 'รายงาน',
    description: 'รายงานสรุปข้อมูล',
    icon: 'file-bar-chart',
    color: 'amber',
    href: '/reports',
    roles: ['owner', 'accountant', 'manager'],
    permission: 'can_view_reports',
    group: 'รายงาน',
  },
  {
    id: 'activity',
    name: 'ตรวจสอบกิจกรรม',
    description: 'ดู audit log และสถานะรายสาขา',
    icon: 'shield-check',
    color: 'cyan',
    href: '/activity',
    roles: ['owner'],
    permission: 'can_manage_settings',
    group: 'รายงาน',
  },

  // ─── วิเคราะห์ ───
  {
    id: 'performance-staff',
    name: 'ประสิทธิภาพพนักงาน',
    description: 'วัดผลงานพนักงาน ranking, เวลาเฉลี่ย, completion rate',
    icon: 'trophy',
    color: 'amber',
    href: '/performance/staff',
    roles: ['owner'],
    permission: 'can_view_reports',
    group: 'วิเคราะห์',
  },
  {
    id: 'performance-stores',
    name: 'เปรียบเทียบสาขา',
    description: 'เปรียบเทียบ KPI ข้ามสาขา side-by-side',
    icon: 'scale',
    color: 'indigo',
    href: '/performance/stores',
    roles: ['owner'],
    permission: 'can_view_reports',
    group: 'วิเคราะห์',
  },
  {
    id: 'performance-operations',
    name: 'สถานะงาน Real-time',
    description: 'ดูงานค้าง งานกำลังทำ และ workload พนักงาน',
    icon: 'zap',
    color: 'rose',
    href: '/performance/operations',
    roles: ['owner'],
    permission: 'can_view_reports',
    group: 'วิเคราะห์',
  },
  {
    id: 'performance-customers',
    name: 'วิเคราะห์ลูกค้า',
    description: 'ลูกค้าขาประจำ พฤติกรรมฝาก/เบิก สินค้ายอดนิยม',
    icon: 'pie-chart',
    color: 'emerald',
    href: '/performance/customers',
    roles: ['owner'],
    permission: 'can_view_reports',
    group: 'วิเคราะห์',
  },

  // ─── ช่วยเหลือ ───
  {
    id: 'guide',
    name: 'คู่มือ',
    description: 'คู่มือการใช้งานระบบ StockManager',
    icon: 'book-open',
    color: 'sky',
    href: '/guide',
    roles: ['owner', 'accountant', 'manager', 'bar', 'staff', 'hq'],
    group: 'ช่วยเหลือ',
  },

  // ─── ระบบ ───
  {
    id: 'announcements',
    name: 'ประกาศ/โปรโมชั่น',
    description: 'สร้างและจัดการประกาศ',
    icon: 'megaphone',
    color: 'pink',
    href: '/announcements',
    roles: ['owner'],
    permission: 'can_manage_settings',
    group: 'ระบบ',
  },
  {
    id: 'users',
    name: 'จัดการผู้ใช้',
    description: 'เพิ่ม แก้ไข ลบผู้ใช้',
    icon: 'user-cog',
    color: 'orange',
    href: '/users',
    roles: ['owner'],
    permission: 'can_manage_users',
    group: 'ระบบ',
  },
  {
    id: 'settings',
    name: 'ตั้งค่า',
    description: 'ตั้งค่าระบบและสาขา',
    icon: 'settings',
    color: 'gray',
    href: '/settings',
    roles: ['owner'],
    permission: 'can_manage_settings',
    group: 'ระบบ',
  },
];

export function getModulesForRole(role: UserRole): ModuleConfig[] {
  return modules.filter((m) => m.roles.includes(role));
}
