-- Scope AE profiles to a single store. Existing 2 rows belong to
-- 24 BLVD (per the user's instruction), so we backfill that store
-- before flipping the column NOT NULL.
ALTER TABLE ae_profiles
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE CASCADE;

UPDATE ae_profiles
   SET store_id = '87b7c604-096e-4e60-996a-9f1215534e29'
 WHERE store_id IS NULL;

ALTER TABLE ae_profiles
  ALTER COLUMN store_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ae_profiles_store ON ae_profiles(store_id);
