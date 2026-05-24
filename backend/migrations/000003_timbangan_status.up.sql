ALTER TABLE timbangan_records
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'approved',
    ADD COLUMN IF NOT EXISTS receipt_id_nullable UUID REFERENCES receipts(id);

-- Back-fill: mark all existing records as approved (they came from bot approval)
UPDATE timbangan_records SET status = 'approved' WHERE status IS NULL OR status = '';
