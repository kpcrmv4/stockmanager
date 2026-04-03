-- Commission Payments: ระบบทำจ่ายค่าคอมมิชชั่น

CREATE TABLE IF NOT EXISTS commission_payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        uuid NOT NULL REFERENCES stores(id),
  ae_id           uuid REFERENCES ae_profiles(id),
  staff_id        uuid REFERENCES profiles(id),
  type            commission_type NOT NULL,
  month           text NOT NULL,           -- YYYY-MM
  total_entries   integer NOT NULL DEFAULT 0,
  total_amount    numeric(12,2) NOT NULL DEFAULT 0,
  slip_photo_url  text,
  notes           text,
  status          text NOT NULL DEFAULT 'paid',  -- paid / cancelled
  paid_by         uuid REFERENCES profiles(id),
  paid_at         timestamptz NOT NULL DEFAULT now(),
  cancelled_by    uuid REFERENCES profiles(id),
  cancelled_at    timestamptz,
  cancel_reason   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Add payment_id to commission_entries
ALTER TABLE commission_entries ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES commission_payments(id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_commission_payments_store_id ON commission_payments(store_id);
CREATE INDEX IF NOT EXISTS idx_commission_payments_ae_id ON commission_payments(ae_id);
CREATE INDEX IF NOT EXISTS idx_commission_payments_month ON commission_payments(month);
CREATE INDEX IF NOT EXISTS idx_commission_payments_status ON commission_payments(status);
CREATE INDEX IF NOT EXISTS idx_commission_entries_payment_id ON commission_entries(payment_id);

-- RLS
ALTER TABLE commission_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "commission_payments_select" ON commission_payments
  FOR SELECT TO authenticated
  USING (
    store_id IN (SELECT get_user_store_ids())
    OR is_admin()
  );

CREATE POLICY "commission_payments_insert" ON commission_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    store_id IN (SELECT get_user_store_ids())
    OR is_admin()
  );

CREATE POLICY "commission_payments_update" ON commission_payments
  FOR UPDATE TO authenticated
  USING (
    store_id IN (SELECT get_user_store_ids())
    OR is_admin()
  );
