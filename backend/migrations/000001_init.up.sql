-- Fish Cold Storage DB — initial schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Storage Locations ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS storage_locations (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code        VARCHAR(20) NOT NULL UNIQUE,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Fish Types ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fish_types (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code        VARCHAR(20) NOT NULL UNIQUE,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Item Categories ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS item_categories (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name       VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Items ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS items (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code           VARCHAR(30) NOT NULL UNIQUE,
    name           VARCHAR(100) NOT NULL,
    category_id    UUID REFERENCES item_categories(id),
    unit           VARCHAR(20) NOT NULL DEFAULT 'pcs',
    price_estimate NUMERIC(15,2) NOT NULL DEFAULT 0,
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Vessels ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vessels (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(100) NOT NULL,
    registration_no VARCHAR(50),
    owner_person_id UUID,        -- plain UUID ref to auth_db.peoples, no FK
    owner_name      VARCHAR(100),
    captain_name    VARCHAR(100),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Employees ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    person_id    UUID,           -- optional link to auth_db
    name         VARCHAR(100) NOT NULL,
    position     VARCHAR(50),
    phone        VARCHAR(20),
    daily_salary NUMERIC(15,2) NOT NULL DEFAULT 0,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    hired_at     DATE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Attendance ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES employees(id),
    attend_date DATE NOT NULL,
    present     BOOLEAN NOT NULL DEFAULT TRUE,
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(employee_id, attend_date)
);

-- ─── Receipts (review workflow) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS receipts (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    receipt_type          VARCHAR(40) NOT NULL,
    status                VARCHAR(20) NOT NULL DEFAULT 'pending',
    submitted_via         VARCHAR(20) NOT NULL DEFAULT 'telegram',
    telegram_message_id   BIGINT,
    telegram_chat_id      BIGINT,
    image_path            TEXT,
    extracted_data        JSONB,
    confirmed_data        JSONB,
    review_token          VARCHAR(36) NOT NULL UNIQUE,
    review_token_expiry   TIMESTAMPTZ NOT NULL,
    review_token_used     BOOLEAN NOT NULL DEFAULT FALSE,
    reviewed_by_person_id UUID,
    reviewed_at           TIMESTAMPTZ,
    rejection_reason      TEXT,
    submitted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_receipts_status ON receipts(status);
CREATE INDEX IF NOT EXISTS idx_receipts_review_token ON receipts(review_token);

-- ─── Timbangan Records ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS timbangan_records (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    receipt_id     UUID NOT NULL REFERENCES receipts(id),
    vessel_id      UUID REFERENCES vessels(id),
    vessel_name    VARCHAR(100) NOT NULL,
    transports     VARCHAR(200),
    timbang_date   DATE NOT NULL,
    total_weight_kg NUMERIC(12,2) NOT NULL DEFAULT 0,
    fish_columns   JSONB,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Invoices ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_no   VARCHAR(50) NOT NULL UNIQUE,
    person_id    UUID,
    person_name  VARCHAR(100),
    invoice_type VARCHAR(10) NOT NULL CHECK (invoice_type IN ('ar','ap')),
    total_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    paid_amount  NUMERIC(15,2) NOT NULL DEFAULT 0,
    due_date     DATE,
    status       VARCHAR(20) NOT NULL DEFAULT 'draft',
    notes        TEXT,
    issued_at    TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_type_status ON invoices(invoice_type, status);

-- ─── Fish Transactions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fish_transactions (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fish_type_id         UUID NOT NULL REFERENCES fish_types(id),
    transaction_type     VARCHAR(10) NOT NULL CHECK (transaction_type IN ('buy','sell','adjust')),
    quantity             NUMERIC(12,2) NOT NULL,
    price_per_kg         NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_amount         NUMERIC(15,2) NOT NULL DEFAULT 0,
    person_id            UUID,
    person_name          VARCHAR(100),
    vessel_id            UUID REFERENCES vessels(id),
    vessel_name          VARCHAR(100),
    receipt_id           UUID REFERENCES receipts(id),
    storage_location_id  UUID REFERENCES storage_locations(id),
    notes                TEXT,
    transaction_date     DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fish_tx_type_date ON fish_transactions(transaction_type, transaction_date);
CREATE INDEX IF NOT EXISTS idx_fish_tx_fish_type ON fish_transactions(fish_type_id);

-- ─── Fish Stock ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fish_stock (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fish_type_id         UUID NOT NULL REFERENCES fish_types(id),
    storage_location_id  UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    quantity             NUMERIC(12,2) NOT NULL DEFAULT 0,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(fish_type_id, storage_location_id)
);

-- ─── Item Transactions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS item_transactions (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id          UUID NOT NULL REFERENCES items(id),
    transaction_type VARCHAR(10) NOT NULL CHECK (transaction_type IN ('in','out','adjust')),
    quantity         NUMERIC(12,3) NOT NULL,
    unit_price       NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_amount     NUMERIC(15,2) NOT NULL DEFAULT 0,
    person_id        UUID,
    person_name      VARCHAR(100),
    receipt_id       UUID REFERENCES receipts(id),
    notes            TEXT,
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Item Stock ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS item_stock (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id              UUID NOT NULL REFERENCES items(id),
    storage_location_id  UUID,
    quantity             NUMERIC(12,3) NOT NULL DEFAULT 0,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(item_id, storage_location_id)
);

-- ─── Titipan (Consignment) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS titipan_records (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    person_id    UUID NOT NULL,
    person_name  VARCHAR(100),
    fish_type_id UUID REFERENCES fish_types(id),
    fish_code    VARCHAR(20),
    deposit_kg   NUMERIC(12,2) NOT NULL,
    remaining_kg NUMERIC(12,2) NOT NULL,
    price_per_kg NUMERIC(12,2) NOT NULL DEFAULT 0,
    deposit_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status       VARCHAR(20) NOT NULL DEFAULT 'active',
    notes        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS titipan_transactions (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    titipan_id       UUID NOT NULL REFERENCES titipan_records(id),
    transaction_type VARCHAR(20) NOT NULL,
    quantity         NUMERIC(12,2) NOT NULL,
    notes            TEXT,
    transaction_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Installment Schedules ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS installment_schedules (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id  UUID NOT NULL REFERENCES invoices(id),
    due_date    DATE NOT NULL,
    amount_due  NUMERIC(15,2) NOT NULL,
    amount_paid NUMERIC(15,2) NOT NULL DEFAULT 0,
    paid_at     TIMESTAMPTZ,
    status      VARCHAR(20) NOT NULL DEFAULT 'pending',
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS installment_payments (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    schedule_id UUID NOT NULL REFERENCES installment_schedules(id),
    amount_paid NUMERIC(15,2) NOT NULL,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Lending ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lending_records (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    person_id    UUID,
    person_name  VARCHAR(100),
    amount       NUMERIC(15,2) NOT NULL,
    paid_amount  NUMERIC(15,2) NOT NULL DEFAULT 0,
    lending_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date     DATE,
    status       VARCHAR(20) NOT NULL DEFAULT 'active',
    notes        TEXT,
    direction    VARCHAR(10) NOT NULL DEFAULT 'given' CHECK (direction IN ('given','received')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Review Field Changes (audit trail) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS review_field_changes (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    receipt_id UUID NOT NULL REFERENCES receipts(id),
    field_path VARCHAR(200) NOT NULL,
    old_value  TEXT,
    new_value  TEXT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Audit Log ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id   UUID NOT NULL,
    action      VARCHAR(20) NOT NULL,
    actor_id    UUID,
    actor_name  VARCHAR(100),
    changes     JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);

-- ─── Seed Data ────────────────────────────────────────────────────────────────

INSERT INTO storage_locations(id, code, name) VALUES
    ('00000000-0000-0000-0000-000000000000', 'DEFAULT', 'Gudang Utama')
ON CONFLICT DO NOTHING;

INSERT INTO fish_types(code, name) VALUES
    ('BH', 'Baronang Hitam'),
    ('BDR', 'Badar'),
    ('BDR PC', 'Badar Pecah'),
    ('CCA', 'Cumi-cumi Asin'),
    ('GBR', 'Gabur'),
    ('GRP', 'Garuppa'),
    ('IKN', 'Ikan Campuran'),
    ('KKP', 'Kakap'),
    ('KPT', 'Kerapu Tutul'),
    ('KRN', 'Kurnia'),
    ('LAY', 'Layang'),
    ('LCH', 'Layur Cokelat Hitam'),
    ('LSR', 'Layang Surai'),
    ('MNS', 'Mansi'),
    ('PPS', 'Pepesek'),
    ('RBT', 'Rabet'),
    ('SRR', 'Sirip'),
    ('SRR H', 'Sirip Hitam'),
    ('TBN', 'Tambun'),
    ('TLC', 'Talacak'),
    ('TNK', 'Tongkol'),
    ('TNG', 'Tenggiri')
ON CONFLICT (code) DO NOTHING;

INSERT INTO item_categories(name) VALUES
    ('Perlengkapan Kapal'),
    ('Bahan Bakar'),
    ('Es Batu'),
    ('Kemasan'),
    ('Peralatan'),
    ('Lainnya')
ON CONFLICT DO NOTHING;
