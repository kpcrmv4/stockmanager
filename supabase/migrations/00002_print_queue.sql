-- ==========================================
-- PRINT QUEUE TABLE
-- ==========================================

CREATE TYPE print_job_status AS ENUM ('pending', 'printing', 'completed', 'failed');
CREATE TYPE print_job_type AS ENUM ('receipt', 'label');

CREATE TABLE print_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  deposit_id UUID REFERENCES deposits(id) ON DELETE SET NULL,
  job_type print_job_type NOT NULL DEFAULT 'receipt',
  status print_job_status NOT NULL DEFAULT 'pending',
  copies INTEGER DEFAULT 1,
  payload JSONB NOT NULL,         -- ข้อมูลที่ต้องพิมพ์ (deposit data snapshot)
  requested_by UUID REFERENCES profiles(id),
  printed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_print_queue_store_status ON print_queue(store_id, status);
CREATE INDEX idx_print_queue_created_at ON print_queue(created_at);

-- RLS
ALTER TABLE print_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff see store print jobs" ON print_queue
  FOR SELECT USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());
CREATE POLICY "Staff manage print jobs" ON print_queue
  FOR ALL USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());

-- Enable Realtime for print queue
ALTER PUBLICATION supabase_realtime ADD TABLE print_queue;
