-- ==========================================
-- Trial Registration System
-- ==========================================

CREATE TABLE trial_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for admin listing
CREATE INDEX idx_trial_registrations_status ON trial_registrations(status);
CREATE INDEX idx_trial_registrations_created ON trial_registrations(created_at DESC);

-- RLS
ALTER TABLE trial_registrations ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (API routes use service client)
-- No user-facing RLS needed since trial users aren't authenticated yet
