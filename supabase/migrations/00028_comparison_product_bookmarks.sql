-- Per-user pin list for the comparison "มุมมองรายสินค้า" table.
-- Pinned products float to the top of the list so the user can keep
-- watch on a few problem SKUs without scrolling past the rest.
CREATE TABLE IF NOT EXISTS comparison_product_bookmarks (
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  store_id     UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_code TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, store_id, product_code)
);

CREATE INDEX IF NOT EXISTS idx_comparison_bookmarks_user_store
  ON comparison_product_bookmarks(user_id, store_id);

ALTER TABLE comparison_product_bookmarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own comparison bookmarks" ON comparison_product_bookmarks;
CREATE POLICY "Users manage own comparison bookmarks"
  ON comparison_product_bookmarks FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
