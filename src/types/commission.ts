export type CommissionType = 'ae_commission' | 'bottle_commission';

export interface AEProfile {
  id: string;
  name: string;
  nickname: string | null;
  phone: string | null;
  bank_name: string | null;
  bank_account_no: string | null;
  bank_account_name: string | null;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommissionEntry {
  id: string;
  store_id: string;
  type: CommissionType;
  ae_id: string | null;
  staff_id: string | null;
  bill_date: string;
  receipt_no: string | null;
  receipt_photo_url: string | null;
  table_no: string | null;
  subtotal_amount: number | null;
  commission_rate: number;
  tax_rate: number;
  commission_amount: number | null;
  tax_amount: number | null;
  net_amount: number;
  bottle_count: number | null;
  bottle_rate: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  payment_id: string | null;
  // joined fields
  ae_profile?: AEProfile;
  staff_profile?: { id: string; display_name: string | null; username: string };
  store?: { id: string; store_name: string; store_code: string };
}

export type PaymentStatus = 'paid' | 'cancelled';

export interface CommissionPayment {
  id: string;
  store_id: string;
  ae_id: string | null;
  staff_id: string | null;
  type: CommissionType;
  month: string;
  total_entries: number;
  total_amount: number;
  slip_photo_url: string | null;
  notes: string | null;
  status: PaymentStatus;
  paid_by: string | null;
  paid_at: string;
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  // joined
  ae_profile?: AEProfile;
  staff_profile?: { id: string; display_name: string | null; username: string };
  paid_by_profile?: { id: string; display_name: string | null; username: string };
}

export interface CommissionSummary {
  ae_id: string | null;
  ae_name: string | null;
  staff_id: string | null;
  staff_name: string | null;
  type: CommissionType;
  entry_count: number;
  total_subtotal: number;
  total_commission: number;
  total_tax: number;
  total_net: number;
  total_bottles: number;
}
