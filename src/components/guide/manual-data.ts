import type { UserRole } from '@/types/roles';

export type ManualSectionId =
  | 'intro'
  | 'roles'
  | 'login'
  | 'owner'
  | 'manager'
  | 'bar'
  | 'staff'
  | 'accountant'
  | 'hq'
  | 'customer'
  | 'deposit'
  | 'stock'
  | 'chat'
  | 'transfer'
  | 'reports'
  | 'notifications'
  | 'settings'
  | 'print'
  | 'commission'
  | 'profile'
  | 'theme'
  | 'summary'
  | 'images';

export interface ManualSection {
  id: ManualSectionId;
  number: number | null;
  title: string;
  desc: string;
  icon: string;
  iconBg: string;
  /** 'all' = shown to every role, otherwise only shown if user role is in the list */
  roles: 'all' | UserRole[];
  tocGroup?: string;
}

export const manualSections: ManualSection[] = [
  // ── ภาพรวมระบบ ──
  {
    id: 'intro',
    number: 1,
    title: 'แนะนำระบบ StockManager',
    desc: 'ภาพรวมระบบและความสามารถหลัก',
    icon: '🚀',
    iconBg: 'bg-violet-500',
    roles: 'all',
    tocGroup: 'ภาพรวมระบบ',
  },
  {
    id: 'roles',
    number: 2,
    title: 'บทบาทผู้ใช้งาน (Roles)',
    desc: 'อธิบายบทบาทและสิทธิ์การเข้าถึง',
    icon: '👥',
    iconBg: 'bg-blue-500',
    roles: 'all',
    tocGroup: 'ภาพรวมระบบ',
  },
  {
    id: 'login',
    number: 3,
    title: 'การเข้าสู่ระบบ',
    desc: 'ขั้นตอนการ Login และ Register',
    icon: '🔒',
    iconBg: 'bg-indigo-500',
    roles: 'all',
    tocGroup: 'ภาพรวมระบบ',
  },
  // ── เมนูตาม Role ──
  {
    id: 'owner',
    number: 4,
    title: 'เจ้าของร้าน (Owner)',
    desc: 'เข้าถึงทุกฟีเจอร์ จัดการทั้งระบบ',
    icon: '👑',
    iconBg: 'bg-violet-500',
    roles: ['owner'],
    tocGroup: 'เมนูตาม Role',
  },
  {
    id: 'manager',
    number: 5,
    title: 'ผู้จัดการ (Manager)',
    desc: 'ดูแลสาขา จัดการสต๊อก โอน/ยืม ดูรายงาน',
    icon: '💼',
    iconBg: 'bg-blue-500',
    roles: ['manager'],
    tocGroup: 'เมนูตาม Role',
  },
  {
    id: 'bar',
    number: 6,
    title: 'หัวหน้าบาร์ (Bar)',
    desc: 'อนุมัติฝากเหล้า ยืนยันรับสินค้า เช็คสต๊อก',
    icon: '🍻',
    iconBg: 'bg-teal-500',
    roles: ['bar'],
    tocGroup: 'เมนูตาม Role',
  },
  {
    id: 'staff',
    number: 7,
    title: 'พนักงาน (Staff)',
    desc: 'รับงานฝาก/เบิก นับสต๊อก ยืมสินค้า',
    icon: '🧑‍💼',
    iconBg: 'bg-amber-500',
    roles: ['staff'],
    tocGroup: 'เมนูตาม Role',
  },
  {
    id: 'accountant',
    number: 8,
    title: 'บัญชี (Accountant)',
    desc: 'ดูรายงานข้อมูลทุกสาขา',
    icon: '💵',
    iconBg: 'bg-orange-500',
    roles: ['accountant'],
    tocGroup: 'เมนูตาม Role',
  },
  {
    id: 'hq',
    number: 9,
    title: 'คลังกลาง (HQ)',
    desc: 'รับโอนสต๊อกจากสาขา จัดการคลังกลาง',
    icon: '🏢',
    iconBg: 'bg-cyan-500',
    roles: ['hq'],
    tocGroup: 'เมนูตาม Role',
  },
  {
    id: 'customer',
    number: 10,
    title: 'ลูกค้า (Customer)',
    desc: 'ดูเหล้าที่ฝาก ขอเบิก ผ่าน LINE',
    icon: '👤',
    iconBg: 'bg-emerald-500',
    roles: ['customer'],
    tocGroup: 'เมนูตาม Role',
  },
  // ── ฟีเจอร์หลัก ──
  {
    id: 'deposit',
    number: 11,
    title: 'ระบบฝาก/เบิกเหล้า',
    desc: 'จัดการขวดเหล้าที่ลูกค้าฝากไว้',
    icon: '🍷',
    iconBg: 'bg-emerald-500',
    roles: 'all',
    tocGroup: 'ฟีเจอร์หลัก',
  },
  {
    id: 'stock',
    number: 12,
    title: 'ระบบเช็คสต๊อก',
    desc: 'นับสต๊อกรายวัน เทียบกับ POS อัตโนมัติ',
    icon: '📋',
    iconBg: 'bg-indigo-500',
    roles: 'all',
    tocGroup: 'ฟีเจอร์หลัก',
  },
  {
    id: 'chat',
    number: 13,
    title: 'ระบบแชทภายใน',
    desc: 'สื่อสารภายในทีม + Action Card รับงาน',
    icon: '💬',
    iconBg: 'bg-blue-500',
    roles: 'all',
    tocGroup: 'ฟีเจอร์หลัก',
  },
  {
    id: 'transfer',
    number: 14,
    title: 'โอนสต๊อก & ยืมสินค้า',
    desc: 'โอนและยืมสินค้าระหว่างสาขา',
    icon: '↔',
    iconBg: 'bg-blue-500',
    roles: 'all',
    tocGroup: 'ฟีเจอร์หลัก',
  },
  {
    id: 'reports',
    number: 15,
    title: 'รายงาน & วิเคราะห์',
    desc: 'รายงานสรุปข้อมูลธุรกิจ',
    icon: '📊',
    iconBg: 'bg-amber-500',
    roles: 'all',
    tocGroup: 'ฟีเจอร์หลัก',
  },
  {
    id: 'notifications',
    number: 16,
    title: 'ระบบแจ้งเตือน',
    desc: 'แจ้งเตือนหลายช่องทาง',
    icon: '🔔',
    iconBg: 'bg-rose-500',
    roles: 'all',
    tocGroup: 'ฟีเจอร์หลัก',
  },
  {
    id: 'settings',
    number: 17,
    title: 'ตั้งค่าระบบ',
    desc: 'จัดการสาขา LINE การแจ้งเตือน',
    icon: '⚙',
    iconBg: 'bg-gray-500',
    roles: 'all',
    tocGroup: 'ฟีเจอร์หลัก',
  },
  {
    id: 'print',
    number: 18,
    title: 'ระบบพิมพ์ใบเสร็จ',
    desc: 'Print Station สำหรับ Thermal Printer 80mm',
    icon: '🖨',
    iconBg: 'bg-cyan-500',
    roles: 'all',
    tocGroup: 'ฟีเจอร์หลัก',
  },
  {
    id: 'commission',
    number: 19,
    title: 'ระบบค่าคอมมิชชั่น',
    desc: 'AE Commission & Bottle Commission — บันทึก สรุป ทำจ่าย',
    icon: '💰',
    iconBg: 'bg-amber-500',
    roles: ['owner', 'accountant', 'manager', 'staff'],
    tocGroup: 'ฟีเจอร์หลัก',
  },
  {
    id: 'profile',
    number: null,
    title: 'โปรไฟล์ & ตั้งค่าส่วนตัว',
    desc: 'ใช้ได้ทุก Role',
    icon: '👤',
    iconBg: 'bg-orange-500',
    roles: 'all',
  },
  {
    id: 'theme',
    number: null,
    title: 'Dark Mode / Light Mode',
    desc: 'สลับโหมดมืด/สว่าง',
    icon: '🎨',
    iconBg: 'bg-violet-500',
    roles: 'all',
  },
  {
    id: 'summary',
    number: null,
    title: 'สรุปเมนูทั้งหมดตาม Role',
    desc: 'ตารางสรุปการเข้าถึงเมนู',
    icon: '📝',
    iconBg: 'bg-indigo-500',
    roles: 'all',
  },
];

export const ROLE_COLOR_CLASSES: Record<UserRole, { badge: string; badgeDark: string; tocNum?: string }> = {
  owner: {
    badge: 'bg-violet-100 text-violet-700',
    badgeDark: 'dark:bg-violet-900 dark:text-violet-300',
    tocNum: 'bg-violet-500',
  },
  manager: {
    badge: 'bg-blue-100 text-blue-700',
    badgeDark: 'dark:bg-blue-900 dark:text-blue-300',
    tocNum: 'bg-blue-500',
  },
  bar: {
    badge: 'bg-teal-100 text-teal-700',
    badgeDark: 'dark:bg-teal-900 dark:text-teal-300',
    tocNum: 'bg-teal-500',
  },
  staff: {
    badge: 'bg-amber-100 text-amber-700',
    badgeDark: 'dark:bg-amber-900 dark:text-amber-300',
    tocNum: 'bg-amber-500',
  },
  accountant: {
    badge: 'bg-orange-100 text-orange-700',
    badgeDark: 'dark:bg-orange-900 dark:text-orange-300',
    tocNum: 'bg-orange-500',
  },
  hq: {
    badge: 'bg-cyan-100 text-cyan-700',
    badgeDark: 'dark:bg-cyan-900 dark:text-cyan-300',
    tocNum: 'bg-cyan-500',
  },
  customer: {
    badge: 'bg-emerald-100 text-emerald-700',
    badgeDark: 'dark:bg-emerald-900 dark:text-emerald-300',
    tocNum: 'bg-emerald-500',
  },
};
