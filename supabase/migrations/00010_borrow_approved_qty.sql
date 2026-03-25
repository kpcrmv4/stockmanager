-- Add approved_quantity to borrow_items (lender specifies actual qty approved)
ALTER TABLE borrow_items ADD COLUMN IF NOT EXISTS approved_quantity NUMERIC(10,2);

-- Add POS bill photo columns (each side uploads POS bill separately)
ALTER TABLE borrows ADD COLUMN IF NOT EXISTS borrower_pos_bill_url TEXT;
ALTER TABLE borrows ADD COLUMN IF NOT EXISTS lender_pos_bill_url TEXT;
