import { createClient } from '@/lib/supabase/client';

/**
 * Audit action types สำหรับระบบต่างๆ
 */
export const AUDIT_ACTIONS = {
  // === Stock Module ===
  STOCK_COUNT_SAVED: 'STOCK_COUNT_SAVED',
  STOCK_COUNT_RESET: 'STOCK_COUNT_RESET',
  STOCK_EXPLANATION_SUBMITTED: 'STOCK_EXPLANATION_SUBMITTED',
  STOCK_EXPLANATION_BATCH: 'STOCK_EXPLANATION_BATCH',
  STOCK_APPROVED: 'STOCK_APPROVED',
  STOCK_REJECTED: 'STOCK_REJECTED',
  STOCK_BATCH_APPROVED: 'STOCK_BATCH_APPROVED',
  STOCK_BATCH_REJECTED: 'STOCK_BATCH_REJECTED',
  STOCK_COMPARISON_GENERATED: 'STOCK_COMPARISON_GENERATED',
  STOCK_TXT_UPLOADED: 'STOCK_TXT_UPLOADED',
  AUTO_ADD_PRODUCT: 'AUTO_ADD_PRODUCT',
  AUTO_DEACTIVATE: 'AUTO_DEACTIVATE',
  AUTO_REACTIVATE: 'AUTO_REACTIVATE',

  // === Product Module ===
  PRODUCT_CREATED: 'PRODUCT_CREATED',
  PRODUCT_UPDATED: 'PRODUCT_UPDATED',
  PRODUCT_TOGGLED: 'PRODUCT_TOGGLED',
  PRODUCT_DELETED: 'PRODUCT_DELETED',

  // === Deposit Module ===
  DEPOSIT_CREATED: 'DEPOSIT_CREATED',
  DEPOSIT_REQUEST_APPROVED: 'DEPOSIT_REQUEST_APPROVED',
  DEPOSIT_REQUEST_REJECTED: 'DEPOSIT_REQUEST_REJECTED',
  DEPOSIT_STATUS_CHANGED: 'DEPOSIT_STATUS_CHANGED',
  DEPOSIT_BAR_CONFIRMED: 'DEPOSIT_BAR_CONFIRMED',
  DEPOSIT_BAR_REJECTED: 'DEPOSIT_BAR_REJECTED',

  // === Withdrawal Module ===
  WITHDRAWAL_COMPLETED: 'WITHDRAWAL_COMPLETED',
  WITHDRAWAL_REJECTED: 'WITHDRAWAL_REJECTED',
  WITHDRAWAL_REQUESTED: 'WITHDRAWAL_REQUESTED',

  // === Transfer Module ===
  TRANSFER_CREATED: 'TRANSFER_CREATED',
  TRANSFER_CONFIRMED: 'TRANSFER_CONFIRMED',
  TRANSFER_REJECTED: 'TRANSFER_REJECTED',

  // === Customer (LINE) ===
  CUSTOMER_DEPOSIT_REQUEST: 'CUSTOMER_DEPOSIT_REQUEST',
  CUSTOMER_WITHDRAWAL_REQUEST: 'CUSTOMER_WITHDRAWAL_REQUEST',
  CUSTOMER_INQUIRY: 'CUSTOMER_INQUIRY',

  // === System (Cron / Auto) ===
  CRON_DAILY_REMINDER_SENT: 'CRON_DAILY_REMINDER_SENT',
  CRON_EXPIRY_CHECK: 'CRON_EXPIRY_CHECK',
  CRON_DEPOSIT_EXPIRED: 'CRON_DEPOSIT_EXPIRED',
  CRON_FOLLOW_UP_SENT: 'CRON_FOLLOW_UP_SENT',

  // === User Management ===
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_DEACTIVATED: 'USER_DEACTIVATED',
  USER_LOGIN: 'USER_LOGIN',
  USER_LOGOUT: 'USER_LOGOUT',

  // === Borrow Module ===
  BORROW_REQUESTED: 'BORROW_REQUESTED',
  BORROW_APPROVED: 'BORROW_APPROVED',
  BORROW_REJECTED: 'BORROW_REJECTED',
  BORROW_POS_CONFIRMED: 'BORROW_POS_CONFIRMED',
  BORROW_COMPLETED: 'BORROW_COMPLETED',

  // === Settings ===
  SETTINGS_UPDATED: 'SETTINGS_UPDATED',
  STORE_CREATED: 'STORE_CREATED',
  STORE_UPDATED: 'STORE_UPDATED',

  // === Audit Log Cleanup ===
  AUDIT_LOG_CLEANUP: 'AUDIT_LOG_CLEANUP',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

interface AuditLogParams {
  store_id?: string | null;
  action_type: AuditAction | string;
  table_name?: string | null;
  record_id?: string | null;
  old_value?: Record<string, unknown> | null;
  new_value?: Record<string, unknown> | null;
  changed_by?: string | null;
}

/**
 * บันทึก audit log (client-side) — fire-and-forget ไม่ throw error
 */
export async function logAudit(params: AuditLogParams): Promise<void> {
  try {
    const supabase = createClient();
    await supabase.from('audit_logs').insert({
      store_id: params.store_id || null,
      action_type: params.action_type,
      table_name: params.table_name || null,
      record_id: params.record_id || null,
      old_value: params.old_value || null,
      new_value: params.new_value || null,
      changed_by: params.changed_by || null,
    });
  } catch (error) {
    // Audit logging should never break the main flow
    console.error('[Audit] Failed to log:', error);
  }
}

/**
 * Thai label + icon mapping สำหรับ action_type (ใช้ในหน้าแสดง audit log)
 */
export const AUDIT_ACTION_LABELS: Record<
  string,
  { label: string; color: string; icon: string }
> = {
  // Stock
  STOCK_COUNT_SAVED: { label: 'บันทึกนับสต๊อก', color: 'indigo', icon: 'clipboard-check' },
  STOCK_EXPLANATION_SUBMITTED: { label: 'ส่งคำชี้แจง', color: 'amber', icon: 'message-square' },
  STOCK_EXPLANATION_BATCH: { label: 'ส่งคำชี้แจง (หลายรายการ)', color: 'amber', icon: 'message-square' },
  STOCK_APPROVED: { label: 'อนุมัติผลสต๊อก', color: 'emerald', icon: 'check-circle' },
  STOCK_REJECTED: { label: 'ปฏิเสธผลสต๊อก', color: 'red', icon: 'x-circle' },
  STOCK_BATCH_APPROVED: { label: 'อนุมัติผลสต๊อก (หลายรายการ)', color: 'emerald', icon: 'check-circle' },
  STOCK_BATCH_REJECTED: { label: 'ปฏิเสธผลสต๊อก (หลายรายการ)', color: 'red', icon: 'x-circle' },
  STOCK_COMPARISON_GENERATED: { label: 'สร้างผลเปรียบเทียบ', color: 'blue', icon: 'bar-chart' },
  STOCK_TXT_UPLOADED: { label: 'อัพโหลดข้อมูล POS', color: 'violet', icon: 'upload' },
  AUTO_ADD_PRODUCT: { label: 'เพิ่มสินค้าอัตโนมัติ', color: 'blue', icon: 'plus-circle' },
  AUTO_DEACTIVATE: { label: 'ปิดสินค้าอัตโนมัติ', color: 'red', icon: 'x-circle' },
  AUTO_REACTIVATE: { label: 'เปิดสินค้าอัตโนมัติ', color: 'emerald', icon: 'check-circle' },

  // Product
  PRODUCT_CREATED: { label: 'เพิ่มสินค้า', color: 'blue', icon: 'plus' },
  PRODUCT_UPDATED: { label: 'แก้ไขสินค้า', color: 'amber', icon: 'edit' },
  PRODUCT_TOGGLED: { label: 'เปิด/ปิดสินค้า', color: 'gray', icon: 'toggle' },
  PRODUCT_DELETED: { label: 'ลบสินค้า', color: 'red', icon: 'trash' },

  // Deposit
  DEPOSIT_CREATED: { label: 'สร้างรายการฝากเหล้า', color: 'emerald', icon: 'wine' },
  DEPOSIT_REQUEST_APPROVED: { label: 'อนุมัติคำขอฝากเหล้า', color: 'emerald', icon: 'check-circle' },
  DEPOSIT_REQUEST_REJECTED: { label: 'ปฏิเสธคำขอฝากเหล้า', color: 'red', icon: 'x-circle' },
  DEPOSIT_STATUS_CHANGED: { label: 'เปลี่ยนสถานะฝากเหล้า', color: 'blue', icon: 'refresh' },
  DEPOSIT_BAR_CONFIRMED: { label: 'บาร์ยืนยันรับฝากเหล้า', color: 'emerald', icon: 'check-circle' },
  DEPOSIT_BAR_REJECTED: { label: 'บาร์ปฏิเสธรับฝากเหล้า', color: 'red', icon: 'x-circle' },

  // Withdrawal
  WITHDRAWAL_COMPLETED: { label: 'เบิกเหล้าสำเร็จ', color: 'emerald', icon: 'package' },
  WITHDRAWAL_REJECTED: { label: 'ปฏิเสธการเบิกเหล้า', color: 'red', icon: 'x-circle' },
  WITHDRAWAL_REQUESTED: { label: 'ขอเบิกเหล้า', color: 'blue', icon: 'package' },

  // Transfer
  TRANSFER_CREATED: { label: 'สร้างรายการโอน', color: 'blue', icon: 'truck' },
  TRANSFER_CONFIRMED: { label: 'ยืนยันรับโอน', color: 'emerald', icon: 'check-circle' },
  TRANSFER_REJECTED: { label: 'ปฏิเสธการโอน', color: 'red', icon: 'x-circle' },

  // Customer LINE
  CUSTOMER_DEPOSIT_REQUEST: { label: 'ลูกค้าขอฝากเหล้า (LINE)', color: 'green', icon: 'wine' },
  CUSTOMER_WITHDRAWAL_REQUEST: { label: 'ลูกค้าขอเบิกเหล้า (LINE)', color: 'green', icon: 'package' },
  CUSTOMER_INQUIRY: { label: 'ลูกค้าสอบถาม (LINE)', color: 'green', icon: 'message-circle' },

  // Cron / System
  CRON_DAILY_REMINDER_SENT: { label: 'ส่งแจ้งเตือนนับสต๊อก', color: 'gray', icon: 'bell' },
  CRON_EXPIRY_CHECK: { label: 'ตรวจสอบเหล้าหมดอายุ', color: 'gray', icon: 'clock' },
  CRON_DEPOSIT_EXPIRED: { label: 'เหล้าหมดอายุอัตโนมัติ', color: 'red', icon: 'alert-triangle' },
  CRON_FOLLOW_UP_SENT: { label: 'ส่งติดตามงาน', color: 'gray', icon: 'bell' },

  // Borrow
  BORROW_REQUESTED: { label: 'สร้างคำขอยืมสินค้า', color: 'teal', icon: 'repeat' },
  BORROW_APPROVED: { label: 'อนุมัติคำขอยืม', color: 'emerald', icon: 'check-circle' },
  BORROW_REJECTED: { label: 'ปฏิเสธคำขอยืม', color: 'red', icon: 'x-circle' },
  BORROW_POS_CONFIRMED: { label: 'ยืนยันตัดสต๊อก POS (ยืม)', color: 'violet', icon: 'check' },
  BORROW_COMPLETED: { label: 'ยืมสินค้าเสร็จสิ้น', color: 'emerald', icon: 'check-circle' },

  // User
  USER_CREATED: { label: 'สร้างผู้ใช้ใหม่', color: 'blue', icon: 'user-plus' },
  USER_UPDATED: { label: 'แก้ไขข้อมูลผู้ใช้', color: 'amber', icon: 'user' },
  USER_DEACTIVATED: { label: 'ปิดการใช้งานผู้ใช้', color: 'red', icon: 'user-x' },
  USER_LOGIN: { label: 'เข้าสู่ระบบ', color: 'gray', icon: 'log-in' },

  // Settings
  SETTINGS_UPDATED: { label: 'อัพเดตการตั้งค่า', color: 'gray', icon: 'settings' },
  STORE_CREATED: { label: 'สร้างสาขาใหม่', color: 'blue', icon: 'store' },
  STORE_UPDATED: { label: 'แก้ไขข้อมูลสาขา', color: 'amber', icon: 'store' },

  // Audit Log Cleanup
  AUDIT_LOG_CLEANUP: { label: 'เคลียร์ Audit Log', color: 'red', icon: 'trash' },
};
