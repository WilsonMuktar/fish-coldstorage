CREATE TABLE IF NOT EXISTS beli_ikan_records (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    receipt_id   UUID REFERENCES receipts(id),
    vessel_id    UUID REFERENCES vessels(id),
    vessel_name  VARCHAR(100),
    buy_date     DATE NOT NULL DEFAULT CURRENT_DATE,
    notes        TEXT,
    total_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS beli_ikan_items (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    beli_ikan_id UUID NOT NULL REFERENCES beli_ikan_records(id) ON DELETE CASCADE,
    fish_type_id UUID REFERENCES fish_types(id),
    fish_code    VARCHAR(20) NOT NULL,
    quantity_kg  NUMERIC(12,2) NOT NULL DEFAULT 0,
    price_per_kg NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(15,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS beli_ikan_timbangan_links (
    beli_ikan_id UUID NOT NULL REFERENCES beli_ikan_records(id) ON DELETE CASCADE,
    timbangan_id UUID NOT NULL REFERENCES timbangan_records(id) ON DELETE CASCADE,
    PRIMARY KEY (beli_ikan_id, timbangan_id)
);
