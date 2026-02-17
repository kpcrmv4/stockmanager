export const APP_NAME = 'StockManager';
export const DEFAULT_TIMEZONE = 'Asia/Bangkok';

export const DEPOSIT_STATUS_LABELS: Record<string, string> = {
  pending_confirm: 'รอยืนยัน',
  in_store: 'อยู่ในร้าน',
  pending_withdrawal: 'รอเบิก',
  withdrawn: 'เบิกแล้ว',
  expired: 'หมดอายุ',
  transferred_out: 'โอนออก',
};

export const COMPARISON_STATUS_LABELS: Record<string, string> = {
  pending: 'รอดำเนินการ',
  explained: 'อธิบายแล้ว',
  approved: 'อนุมัติแล้ว',
  rejected: 'ปฏิเสธ',
};

export const WITHDRAWAL_STATUS_LABELS: Record<string, string> = {
  pending: 'รอดำเนินการ',
  approved: 'อนุมัติแล้ว',
  completed: 'เสร็จสิ้น',
  rejected: 'ปฏิเสธ',
};

export const TRANSFER_STATUS_LABELS: Record<string, string> = {
  pending: 'รอดำเนินการ',
  confirmed: 'ยืนยันแล้ว',
  rejected: 'ปฏิเสธ',
};

export const NOTIFICATION_TYPES = {
  STOCK_ALERT: 'stock_alert',
  DEPOSIT_EXPIRY: 'deposit_expiry',
  DEPOSIT_CONFIRMED: 'deposit_confirmed',
  WITHDRAWAL_COMPLETED: 'withdrawal_completed',
  APPROVAL_REQUEST: 'approval_request',
  PROMOTION: 'promotion',
} as const;
