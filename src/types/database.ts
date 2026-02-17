import type { UserRole } from './roles';

export interface Profile {
  id: string;
  username: string;
  role: UserRole;
  line_user_id: string | null;
  display_name: string | null;
  avatar_url: string | null;
  active: boolean;
  created_at: string;
  created_by: string | null;
}

export interface Store {
  id: string;
  store_code: string;
  store_name: string;
  line_token: string | null;
  line_channel_id: string | null;
  staff_group_id: string | null;
  bar_group_id: string | null;
  manager_id: string | null;
  is_central: boolean;
  active: boolean;
  created_at: string;
}

export interface UserStore {
  user_id: string;
  store_id: string;
}

export interface UserPermission {
  id: string;
  user_id: string;
  permission: string;
  granted_by: string | null;
  created_at: string;
}

export interface Product {
  id: string;
  store_id: string;
  product_code: string;
  product_name: string;
  category: string | null;
  size: string | null;
  unit: string | null;
  price: number | null;
  active: boolean;
  created_at: string;
}

export interface ManualCount {
  id: string;
  store_id: string;
  count_date: string;
  product_code: string;
  count_quantity: number;
  user_id: string | null;
  notes: string | null;
  verified: boolean;
  created_at: string;
}

export interface OcrLog {
  id: string;
  store_id: string;
  upload_date: string;
  count_items: number | null;
  processed_items: number | null;
  status: string;
  upload_method: string | null;
  file_urls: string[] | null;
}

export interface OcrItem {
  id: string;
  ocr_log_id: string;
  product_code: string | null;
  product_name: string | null;
  qty_ocr: number | null;
  unit: string | null;
  confidence: number | null;
  status: string;
  notes: string | null;
}

export type ComparisonStatus = 'pending' | 'explained' | 'approved' | 'rejected';

export interface Comparison {
  id: string;
  store_id: string;
  comp_date: string;
  product_code: string;
  product_name: string | null;
  pos_quantity: number | null;
  manual_quantity: number | null;
  difference: number | null;
  diff_percent: number | null;
  status: ComparisonStatus;
  explanation: string | null;
  explained_by: string | null;
  approved_by: string | null;
  approval_status: string | null;
  owner_notes: string | null;
  created_at: string;
}

export type DepositStatus =
  | 'pending_confirm'
  | 'in_store'
  | 'pending_withdrawal'
  | 'withdrawn'
  | 'expired'
  | 'transferred_out';

export interface Deposit {
  id: string;
  store_id: string;
  deposit_code: string;
  customer_id: string | null;
  line_user_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  product_name: string;
  category: string | null;
  quantity: number;
  remaining_qty: number;
  remaining_percent: number;
  table_number: string | null;
  status: DepositStatus;
  expiry_date: string | null;
  received_by: string | null;
  notes: string | null;
  photo_url: string | null;
  created_at: string;
}

export type WithdrawalStatus = 'pending' | 'approved' | 'completed' | 'rejected';

export interface Withdrawal {
  id: string;
  deposit_id: string;
  store_id: string;
  line_user_id: string | null;
  customer_name: string | null;
  product_name: string | null;
  requested_qty: number | null;
  actual_qty: number | null;
  table_number: string | null;
  status: WithdrawalStatus;
  processed_by: string | null;
  notes: string | null;
  created_at: string;
}

export interface DepositRequest {
  id: string;
  store_id: string;
  line_user_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  product_name: string | null;
  quantity: number | null;
  notes: string | null;
  status: string;
  created_at: string;
}

export type TransferStatus = 'pending' | 'confirmed' | 'rejected';

export interface Transfer {
  id: string;
  from_store_id: string;
  to_store_id: string;
  deposit_id: string | null;
  product_name: string | null;
  quantity: number | null;
  status: TransferStatus;
  requested_by: string | null;
  confirmed_by: string | null;
  notes: string | null;
  created_at: string;
}

export interface StoreSettings {
  id: string;
  store_id: string;
  notify_time_daily: string | null;
  notify_days: string[] | null;
  diff_tolerance: number;
  staff_registration_code: string | null;
  receipt_settings: Record<string, unknown> | null;
  customer_notify_expiry_enabled: boolean;
  customer_notify_expiry_days: number;
  customer_notify_withdrawal_enabled: boolean;
  customer_notify_deposit_enabled: boolean;
  customer_notify_promotion_enabled: boolean;
  customer_notify_channels: string[];
}

export interface Notification {
  id: string;
  user_id: string;
  store_id: string | null;
  title: string;
  body: string | null;
  type: string | null;
  read: boolean;
  data: Record<string, unknown> | null;
  created_at: string;
}

export interface NotificationPreferences {
  id: string;
  user_id: string;
  pwa_enabled: boolean;
  line_enabled: boolean;
  notify_deposit_confirmed: boolean;
  notify_withdrawal_completed: boolean;
  notify_expiry_warning: boolean;
  notify_promotions: boolean;
  notify_stock_alert: boolean;
  notify_approval_request: boolean;
  created_at: string;
}

export interface Announcement {
  id: string;
  store_id: string | null;
  title: string;
  body: string | null;
  image_url: string | null;
  type: 'promotion' | 'announcement' | 'event';
  target_audience: 'customer' | 'staff' | 'all';
  start_date: string;
  end_date: string | null;
  send_push: boolean;
  push_sent_at: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface Penalty {
  id: string;
  store_id: string;
  staff_id: string;
  reason: string | null;
  amount: number | null;
  status: string;
  approved_by: string | null;
  notes: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  store_id: string | null;
  action_type: string;
  table_name: string | null;
  record_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  changed_by: string | null;
  created_at: string;
}

export interface PushSubscription {
  id: string;
  user_id: string;
  subscription: Record<string, unknown>;
  device_name: string | null;
  active: boolean;
  created_at: string;
}

export type PrintJobStatus = 'pending' | 'printing' | 'completed' | 'failed';
export type PrintJobType = 'receipt' | 'label';

export interface PrintJob {
  id: string;
  store_id: string;
  deposit_id: string | null;
  job_type: PrintJobType;
  status: PrintJobStatus;
  copies: number;
  payload: PrintPayload;
  requested_by: string | null;
  printed_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface PrintPayload {
  deposit_code: string;
  customer_name: string;
  customer_phone: string | null;
  product_name: string;
  category: string | null;
  quantity: number;
  remaining_qty: number;
  table_number: string | null;
  expiry_date: string | null;
  created_at: string;
  store_name: string;
  received_by_name: string | null;
}

export interface ReceiptSettings {
  logo_url: string | null;
  header_text: string;
  footer_text: string;
  paper_width: 58 | 80;
  show_logo: boolean;
  show_qr: boolean;
  receipt_copies: number;
  label_copies: number;
}
