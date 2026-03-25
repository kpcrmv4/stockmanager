// ==========================================
// Transfer Chat System — Dedicated Types
// ==========================================
// ออกแบบเฉพาะสำหรับระบบโอนสต๊อก/คลังกลาง
// ไม่ใช้ร่วมกับ action card อื่น

/**
 * Transfer Action Card — metadata สำหรับ action card โอนสต๊อก
 * เก็บใน chat_messages.metadata เมื่อ action_type = 'transfer_receive'
 */
export interface TransferCardMetadata {
  action_type: 'transfer_receive';
  transfer_code: string;
  from_store_id: string;
  from_store_name: string;
  status: TransferCardStatus;
  priority: 'urgent' | 'normal' | 'low';
  timeout_minutes: number;

  // Batch info — transfer card จัดกลุ่มเป็น batch
  items: TransferCardItem[];
  total_items: number;
  total_quantity: number;

  // Submit info
  submitted_by: string | null;
  submitted_by_name: string | null;
  submitted_at: string;
  photo_url: string | null; // รูปนำส่งจากสาขา
  notes: string | null;

  // Receive / Reject info
  received_by: string | null;
  received_by_name: string | null;
  received_at: string | null;
  receive_photo_url: string | null; // รูปยืนยันรับ HQ
  receive_notes: string | null;

  rejected_by: string | null;
  rejected_by_name: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
}

export type TransferCardStatus =
  | 'pending'        // รอ HQ รับ
  | 'received'       // HQ ยืนยันรับแล้ว
  | 'rejected'       // HQ ปฏิเสธ
  | 'partial';       // รับบางรายการ ปฏิเสธบางรายการ

export interface TransferCardItem {
  transfer_id: string;
  deposit_id: string | null;
  deposit_code: string | null;
  product_name: string;
  customer_name: string | null;
  quantity: number;
  category: string | null;
}
