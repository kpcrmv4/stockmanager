import type { UserRole, Permission } from '@/types/roles';

export interface ModuleConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  href: string;
  roles: UserRole[];
  permission?: Permission;
  badge?: 'pending_count';
}

export const modules: ModuleConfig[] = [
  {
    id: 'stock',
    name: 'เช็คสต๊อก',
    description: 'นับสต๊อก เปรียบเทียบ อธิบายผลต่าง',
    icon: 'clipboard-list',
    href: '/stock',
    roles: ['owner', 'manager', 'bar', 'staff'],
    permission: 'can_count_stock',
  },
  {
    id: 'deposit',
    name: 'ฝาก/เบิกเหล้า',
    description: 'จัดการฝากเหล้าและเบิกเหล้า',
    icon: 'wine',
    href: '/deposit',
    roles: ['owner', 'bar', 'staff'],
    permission: 'can_manage_deposit',
  },
  {
    id: 'transfer',
    name: 'โอนสต๊อก',
    description: 'โอนสต๊อกระหว่างสาขา',
    icon: 'truck',
    href: '/transfer',
    roles: ['owner', 'manager'],
    permission: 'can_transfer',
  },
  {
    id: 'reports',
    name: 'รายงาน',
    description: 'รายงานสรุปข้อมูล',
    icon: 'bar-chart-3',
    href: '/reports',
    roles: ['owner', 'accountant', 'manager'],
    permission: 'can_view_reports',
  },
  {
    id: 'announcements',
    name: 'ประกาศ/โปรโมชั่น',
    description: 'สร้างและจัดการประกาศ',
    icon: 'megaphone',
    href: '/announcements',
    roles: ['owner'],
    permission: 'can_manage_settings',
  },
  {
    id: 'users',
    name: 'จัดการผู้ใช้',
    description: 'เพิ่ม แก้ไข ลบผู้ใช้',
    icon: 'users',
    href: '/users',
    roles: ['owner'],
    permission: 'can_manage_users',
  },
  {
    id: 'settings',
    name: 'ตั้งค่า',
    description: 'ตั้งค่าระบบและสาขา',
    icon: 'settings',
    href: '/settings',
    roles: ['owner'],
    permission: 'can_manage_settings',
  },
  // อนาคต:
  // {
  //   id: 'borrow',
  //   name: 'ยืมเหล้า',
  //   description: 'ยืมเหล้าระหว่างสาขา',
  //   icon: 'repeat',
  //   href: '/borrow',
  //   roles: ['owner', 'manager'],
  // },
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
