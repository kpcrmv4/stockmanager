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
}

export const modules: ModuleConfig[] = [
  {
    id: 'overview',
    name: 'ภาพรวม',
    description: 'แดชบอร์ดภาพรวมระบบ',
    icon: 'layout-dashboard',
    color: 'violet',
    href: '/overview',
    roles: ['owner', 'accountant', 'manager', 'hq'],
  },
  {
    id: 'stock',
    name: 'เช็คสต๊อก',
    description: 'นับสต๊อก เปรียบเทียบ อธิบายผลต่าง',
    icon: 'clipboard-list',
    color: 'indigo',
    href: '/stock',
    roles: ['owner', 'manager', 'bar', 'staff'],
    permission: 'can_count_stock',
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
  },
  {
    id: 'transfer',
    name: 'โอนสต๊อก',
    description: 'โอนสต๊อกระหว่างสาขา',
    icon: 'truck',
    color: 'blue',
    href: '/transfer',
    roles: ['owner', 'manager'],
    permission: 'can_transfer',
  },
  {
    id: 'reports',
    name: 'รายงาน',
    description: 'รายงานสรุปข้อมูล',
    icon: 'bar-chart-3',
    color: 'amber',
    href: '/reports',
    roles: ['owner', 'accountant', 'manager'],
    permission: 'can_view_reports',
  },
  {
    id: 'announcements',
    name: 'ประกาศ/โปรโมชั่น',
    description: 'สร้างและจัดการประกาศ',
    icon: 'megaphone',
    color: 'pink',
    href: '/announcements',
    roles: ['owner'],
    permission: 'can_manage_settings',
  },
  {
    id: 'activity',
    name: 'ตรวจสอบกิจกรรม',
    description: 'ดู audit log และสถานะรายสาขา',
    icon: 'activity',
    color: 'cyan',
    href: '/activity',
    roles: ['owner'],
    permission: 'can_manage_settings',
  },
  {
    id: 'users',
    name: 'จัดการผู้ใช้',
    description: 'เพิ่ม แก้ไข ลบผู้ใช้',
    icon: 'users',
    color: 'orange',
    href: '/users',
    roles: ['owner'],
    permission: 'can_manage_users',
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
  },
  {
    id: 'borrow',
    name: 'ยืมสินค้า',
    description: 'ยืมสินค้าระหว่างสาขา',
    icon: 'repeat',
    color: 'rose',
    href: '/borrow',
    roles: ['owner', 'manager', 'staff'],
    permission: 'can_borrow',
  },
  // {
  //   id: 'food-cost',
  //   name: 'ต้นทุนอาหาร',
  //   description: 'คำนวณต้นทุนอาหาร',
  //   icon: 'calculator',
  //   href: '/food-cost',
  //   roles: ['owner', 'accountant'],
  // },
];

export function getModulesForRole(role: UserRole): ModuleConfig[] {
  return modules.filter((m) => m.roles.includes(role));
}
