ALTER TABLE sorting_operations
  ADD COLUMN IF NOT EXISTS receipt_id uuid REFERENCES receipts(id);

CREATE INDEX IF NOT EXISTS idx_sorting_ops_receipt ON sorting_operations(receipt_id);
