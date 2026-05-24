-- ============================================================
-- fish-coldstorage database schema
-- PostgreSQL 16
-- Generated: 2026-05-24
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;

-- ────────────────────────────────────────────────────────────
-- TABLES
-- ────────────────────────────────────────────────────────────

CREATE TABLE public.vessels (
    id                  uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name                varchar(100) NOT NULL,
    registration_no     varchar(50),
    owner_person_id     uuid,
    owner_name          varchar(100),
    captain_name        varchar(100),
    photo_path          varchar(500),
    is_active           boolean DEFAULT true NOT NULL,
    created_at          timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public.storage_locations (
    id          uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    code        varchar(20) NOT NULL,
    name        varchar(100) NOT NULL,
    description text,
    created_at  timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public.fish_types (
    id                      uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    code                    varchar(20) NOT NULL,
    name                    varchar(100) NOT NULL,
    description             text,
    aliases                 text DEFAULT '',
    photo_path              text DEFAULT '',
    is_active               boolean DEFAULT true NOT NULL,
    is_sorted               boolean DEFAULT false NOT NULL,
    source_fish_type_id     uuid,  -- FK to fish_types (sorted variant's raw source)
    canonical_fish_type_id  uuid,  -- FK to fish_types (alias grouping)
    grade                   varchar(30) DEFAULT '',
    created_at              timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public.fish_stock (
    id                  uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    fish_type_id        uuid NOT NULL,
    storage_location_id uuid DEFAULT '00000000-0000-0000-0000-000000000000' NOT NULL,
    quantity            numeric(12,2) DEFAULT 0 NOT NULL,
    updated_at          timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public.receipts (
    id                      uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    receipt_type            varchar(40) NOT NULL,  -- timbangan_ikan_basah | timbangan_sortir | bon_penjualan | bon_pengeluaran | invoice | beli_ikan | beli_item | bayar_jasa
    status                  varchar(20) DEFAULT 'pending' NOT NULL,  -- pending | approved | rejected
    submitted_via           varchar(20) DEFAULT 'telegram' NOT NULL,
    telegram_message_id     bigint,
    telegram_chat_id        bigint,
    image_path              text,
    extracted_data          jsonb,
    confirmed_data          jsonb,
    review_token            varchar(36) NOT NULL,
    review_token_expiry     timestamptz NOT NULL,
    review_token_used       boolean DEFAULT false NOT NULL,
    reviewed_by_person_id   uuid,
    reviewed_at             timestamptz,
    rejection_reason        text,
    submitted_at            timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public.review_field_changes (
    id          uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    receipt_id  uuid NOT NULL,
    field_path  varchar(200) NOT NULL,
    old_value   text,
    new_value   text,
    changed_at  timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public.fish_transactions (
    id                  uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    fish_type_id        uuid NOT NULL,
    transaction_type    varchar(10) NOT NULL,  -- buy | sell | adjust
    quantity            numeric(12,2) NOT NULL,
    price_per_kg        numeric(12,2) DEFAULT 0 NOT NULL,
    total_amount        numeric(15,2) DEFAULT 0 NOT NULL,
    person_id           uuid,
    person_name         varchar(100),
    vessel_id           uuid,
    vessel_name         varchar(100),
    receipt_id          uuid,
    storage_location_id uuid,
    notes               text,
    transaction_date    date DEFAULT CURRENT_DATE NOT NULL,
    created_at          timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT fish_transactions_transaction_type_check
        CHECK (transaction_type = ANY (ARRAY['buy','sell','adjust']))
);

CREATE TABLE public.timbangan_records (
    id                  uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    receipt_id          uuid NOT NULL,
    receipt_id_nullable uuid,
    vessel_id           uuid,
    vessel_name         varchar(100) NOT NULL,
    transports          varchar(200),
    timbang_date        date NOT NULL,
    total_weight_kg     numeric(12,2) DEFAULT 0 NOT NULL,
    fish_columns        jsonb,
    status              varchar(20) DEFAULT 'approved' NOT NULL,
    created_at          timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public.sorting_operations (
    id                  uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    source_fish_type_id uuid NOT NULL,
    input_kg            numeric(12,2) NOT NULL,
    waste_kg            numeric(12,2) DEFAULT 0 NOT NULL,
    notes               text,
    sort_date           date DEFAULT CURRENT_DATE NOT NULL,
    created_by          uuid,
    created_by_name     varchar(100),
    receipt_id          uuid,
    created_at          timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public.sorting_outputs (
    id                      uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    sorting_operation_id    uuid NOT NULL,
    fish_type_id            uuid NOT NULL,
    output_kg               numeric(12,2) NOT NULL,
    created_at              timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public.beli_ikan_records (
    id              uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    receipt_id      uuid,
    vessel_id       uuid,
    vessel_name     varchar(100),
    buy_date        date DEFAULT CURRENT_DATE NOT NULL,
    notes           text,
    total_amount    numeric(15,2) DEFAULT 0 NOT NULL,
    created_at      timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public.beli_ikan_items (
    id              uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    beli_ikan_id    uuid NOT NULL,
    fish_type_id    uuid,
    fish_code       varchar(20) NOT NULL,
    quantity_kg     numeric(12,2) DEFAULT 0 NOT NULL,
    price_per_kg    numeric(12,2) DEFAULT 0 NOT NULL,
    total_amount    numeric(15,2) DEFAULT 0 NOT NULL
);

CREATE TABLE public.beli_ikan_timbangan_links (
    beli_ikan_id    uuid NOT NULL,
    timbangan_id    uuid NOT NULL
);

CREATE TABLE public.item_categories (
    id          uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name        varchar(100) NOT NULL,
    created_at  timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public.items (
    id              uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    code            varchar(30) NOT NULL,
    name            varchar(100) NOT NULL,
    category_id     uuid,
    unit            varchar(20) DEFAULT 'pcs' NOT NULL,
    price_estimate  numeric(15,2) DEFAULT 0 NOT NULL,
    is_active       boolean DEFAULT true NOT NULL,
    created_at      timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public.item_stock (
    id                  uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    item_id             uuid NOT NULL,
    storage_location_id uuid,
    quantity            numeric(12,3) DEFAULT 0 NOT NULL,
    updated_at          timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public.item_transactions (
    id               uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    item_id          uuid NOT NULL,
    transaction_type varchar(10) NOT NULL,  -- in | out | adjust
    quantity         numeric(12,3) NOT NULL,
    unit_price       numeric(15,2) DEFAULT 0 NOT NULL,
    total_amount     numeric(15,2) DEFAULT 0 NOT NULL,
    person_id        uuid,
    person_name      varchar(100),
    receipt_id       uuid,
    notes            text,
    transaction_date date DEFAULT CURRENT_DATE NOT NULL,
    created_at       timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT item_transactions_transaction_type_check
        CHECK (transaction_type = ANY (ARRAY['in','out','adjust']))
);

CREATE TABLE public.invoices (
    id              uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    invoice_no      varchar(50) NOT NULL,
    person_id       uuid,
    person_name     varchar(100),
    invoice_type    varchar(10) NOT NULL,  -- ar | ap
    total_amount    numeric(15,2) DEFAULT 0 NOT NULL,
    paid_amount     numeric(15,2) DEFAULT 0 NOT NULL,
    due_date        date,
    status          varchar(20) DEFAULT 'draft' NOT NULL,  -- draft | issued | partial | paid | overdue
    notes           text,
    issued_at       timestamptz,
    created_at      timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT invoices_invoice_type_check
        CHECK (invoice_type = ANY (ARRAY['ar','ap']))
);

CREATE TABLE public.installment_schedules (
    id          uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    invoice_id  uuid NOT NULL,
    due_date    date NOT NULL,
    amount_due  numeric(15,2) NOT NULL,
    amount_paid numeric(15,2) DEFAULT 0 NOT NULL,
    paid_at     timestamptz,
    status      varchar(20) DEFAULT 'pending' NOT NULL,  -- pending | paid | overdue
    notes       text,
    created_at  timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public.installment_payments (
    id           uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    schedule_id  uuid NOT NULL,
    amount_paid  numeric(15,2) NOT NULL,
    payment_date date DEFAULT CURRENT_DATE NOT NULL,
    notes        text,
    created_at   timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public.lending_records (
    id           uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    person_id    uuid,
    person_name  varchar(100),
    amount       numeric(15,2) NOT NULL,
    paid_amount  numeric(15,2) DEFAULT 0 NOT NULL,
    lending_date date DEFAULT CURRENT_DATE NOT NULL,
    due_date     date,
    status       varchar(20) DEFAULT 'active' NOT NULL,  -- active | partial | settled
    notes        text,
    direction    varchar(10) DEFAULT 'given' NOT NULL,   -- given | received
    created_at   timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT lending_records_direction_check
        CHECK (direction = ANY (ARRAY['given','received']))
);

CREATE TABLE public.titipan_records (
    id           uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    person_id    uuid NOT NULL,
    person_name  varchar(100),
    fish_type_id uuid,
    fish_code    varchar(20),
    deposit_kg   numeric(12,2) NOT NULL,
    remaining_kg numeric(12,2) NOT NULL,
    price_per_kg numeric(12,2) DEFAULT 0 NOT NULL,
    deposit_date date DEFAULT CURRENT_DATE NOT NULL,
    status       varchar(20) DEFAULT 'active' NOT NULL,
    notes        text,
    created_at   timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public.titipan_transactions (
    id               uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    titipan_id       uuid NOT NULL,
    transaction_type varchar(20) NOT NULL,  -- deposit | withdrawal
    quantity         numeric(12,2) NOT NULL,
    notes            text,
    transaction_date timestamptz DEFAULT now() NOT NULL,
    created_at       timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public.expenses (
    id          uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    date        date DEFAULT CURRENT_DATE NOT NULL,
    category    varchar(50) NOT NULL,  -- bon_pengeluaran | bayar_jasa | beli_item
    description text DEFAULT '' NOT NULL,
    amount      numeric(15,2) DEFAULT 0 NOT NULL,
    notes       text DEFAULT '' NOT NULL,
    photo_path  varchar(500) DEFAULT '' NOT NULL,
    receipt_id  uuid,
    created_at  timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public.employees (
    id           uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    person_id    uuid,
    name         varchar(100) NOT NULL,
    "position"   varchar(50),
    phone        varchar(20),
    daily_salary numeric(15,2) DEFAULT 0 NOT NULL,
    is_active    boolean DEFAULT true NOT NULL,
    hired_at     date,
    created_at   timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public.attendance (
    id          uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    employee_id uuid NOT NULL,
    attend_date date NOT NULL,
    present     boolean DEFAULT true NOT NULL,
    notes       text,
    created_at  timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public.audit_logs (
    id          uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    entity_type varchar(50) NOT NULL,
    entity_id   uuid NOT NULL,
    action      varchar(20) NOT NULL,
    actor_id    uuid,
    actor_name  varchar(100),
    changes     jsonb,
    created_at  timestamptz DEFAULT now() NOT NULL
);

-- ────────────────────────────────────────────────────────────
-- PRIMARY KEYS
-- ────────────────────────────────────────────────────────────

ALTER TABLE ONLY public.attendance              ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.audit_logs              ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.beli_ikan_items         ADD CONSTRAINT beli_ikan_items_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.beli_ikan_records       ADD CONSTRAINT beli_ikan_records_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.beli_ikan_timbangan_links ADD CONSTRAINT beli_ikan_timbangan_links_pkey PRIMARY KEY (beli_ikan_id, timbangan_id);
ALTER TABLE ONLY public.employees               ADD CONSTRAINT employees_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.expenses                ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.fish_stock              ADD CONSTRAINT fish_stock_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.fish_transactions       ADD CONSTRAINT fish_transactions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.fish_types              ADD CONSTRAINT fish_types_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.installment_payments    ADD CONSTRAINT installment_payments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.installment_schedules   ADD CONSTRAINT installment_schedules_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.invoices                ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.item_categories         ADD CONSTRAINT item_categories_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.item_stock              ADD CONSTRAINT item_stock_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.item_transactions       ADD CONSTRAINT item_transactions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.items                   ADD CONSTRAINT items_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.lending_records         ADD CONSTRAINT lending_records_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.receipts                ADD CONSTRAINT receipts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.review_field_changes    ADD CONSTRAINT review_field_changes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.sorting_operations      ADD CONSTRAINT sorting_operations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.sorting_outputs         ADD CONSTRAINT sorting_outputs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.storage_locations       ADD CONSTRAINT storage_locations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.timbangan_records       ADD CONSTRAINT timbangan_records_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.titipan_records         ADD CONSTRAINT titipan_records_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.titipan_transactions    ADD CONSTRAINT titipan_transactions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.vessels                 ADD CONSTRAINT vessels_pkey PRIMARY KEY (id);

-- ────────────────────────────────────────────────────────────
-- UNIQUE CONSTRAINTS
-- ────────────────────────────────────────────────────────────

ALTER TABLE ONLY public.attendance          ADD CONSTRAINT attendance_employee_id_attend_date_key UNIQUE (employee_id, attend_date);
ALTER TABLE ONLY public.fish_stock          ADD CONSTRAINT fish_stock_fish_type_id_storage_location_id_key UNIQUE (fish_type_id, storage_location_id);
ALTER TABLE ONLY public.fish_types          ADD CONSTRAINT fish_types_code_key UNIQUE (code);
ALTER TABLE ONLY public.invoices            ADD CONSTRAINT invoices_invoice_no_key UNIQUE (invoice_no);
ALTER TABLE ONLY public.item_categories     ADD CONSTRAINT item_categories_name_key UNIQUE (name);
ALTER TABLE ONLY public.item_stock          ADD CONSTRAINT item_stock_item_id_storage_location_id_key UNIQUE (item_id, storage_location_id);
ALTER TABLE ONLY public.items               ADD CONSTRAINT items_code_key UNIQUE (code);
ALTER TABLE ONLY public.receipts            ADD CONSTRAINT receipts_review_token_key UNIQUE (review_token);
ALTER TABLE ONLY public.storage_locations   ADD CONSTRAINT storage_locations_code_key UNIQUE (code);

-- ────────────────────────────────────────────────────────────
-- INDEXES
-- ────────────────────────────────────────────────────────────

CREATE INDEX idx_audit_entity           ON public.audit_logs          USING btree (entity_type, entity_id);
CREATE INDEX idx_expenses_category      ON public.expenses             USING btree (category);
CREATE INDEX idx_expenses_date          ON public.expenses             USING btree (date);
CREATE INDEX idx_fish_tx_fish_type      ON public.fish_transactions    USING btree (fish_type_id);
CREATE INDEX idx_fish_tx_type_date      ON public.fish_transactions    USING btree (transaction_type, transaction_date);
CREATE INDEX idx_fish_types_canonical   ON public.fish_types           USING btree (canonical_fish_type_id) WHERE canonical_fish_type_id IS NOT NULL;
CREATE INDEX idx_fish_types_source      ON public.fish_types           USING btree (source_fish_type_id)    WHERE source_fish_type_id IS NOT NULL;
CREATE INDEX idx_invoices_type_status   ON public.invoices             USING btree (invoice_type, status);
CREATE INDEX idx_receipts_review_token  ON public.receipts             USING btree (review_token);
CREATE INDEX idx_receipts_status        ON public.receipts             USING btree (status);
CREATE INDEX idx_sorting_ops_receipt    ON public.sorting_operations   USING btree (receipt_id);
CREATE INDEX idx_sorting_ops_source     ON public.sorting_operations   USING btree (source_fish_type_id, sort_date);
CREATE INDEX idx_sorting_outputs_op     ON public.sorting_outputs      USING btree (sorting_operation_id);

-- ────────────────────────────────────────────────────────────
-- FOREIGN KEYS
-- ────────────────────────────────────────────────────────────

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_employee_id_fkey
    FOREIGN KEY (employee_id) REFERENCES public.employees(id);

ALTER TABLE ONLY public.beli_ikan_items
    ADD CONSTRAINT beli_ikan_items_beli_ikan_id_fkey
    FOREIGN KEY (beli_ikan_id) REFERENCES public.beli_ikan_records(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.beli_ikan_items
    ADD CONSTRAINT beli_ikan_items_fish_type_id_fkey
    FOREIGN KEY (fish_type_id) REFERENCES public.fish_types(id);

ALTER TABLE ONLY public.beli_ikan_records
    ADD CONSTRAINT beli_ikan_records_receipt_id_fkey
    FOREIGN KEY (receipt_id) REFERENCES public.receipts(id);

ALTER TABLE ONLY public.beli_ikan_records
    ADD CONSTRAINT beli_ikan_records_vessel_id_fkey
    FOREIGN KEY (vessel_id) REFERENCES public.vessels(id);

ALTER TABLE ONLY public.beli_ikan_timbangan_links
    ADD CONSTRAINT beli_ikan_timbangan_links_beli_ikan_id_fkey
    FOREIGN KEY (beli_ikan_id) REFERENCES public.beli_ikan_records(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.beli_ikan_timbangan_links
    ADD CONSTRAINT beli_ikan_timbangan_links_timbangan_id_fkey
    FOREIGN KEY (timbangan_id) REFERENCES public.timbangan_records(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_receipt_id_fkey
    FOREIGN KEY (receipt_id) REFERENCES public.receipts(id);

ALTER TABLE ONLY public.fish_stock
    ADD CONSTRAINT fish_stock_fish_type_id_fkey
    FOREIGN KEY (fish_type_id) REFERENCES public.fish_types(id);

ALTER TABLE ONLY public.fish_transactions
    ADD CONSTRAINT fish_transactions_fish_type_id_fkey
    FOREIGN KEY (fish_type_id) REFERENCES public.fish_types(id);

ALTER TABLE ONLY public.fish_transactions
    ADD CONSTRAINT fish_transactions_receipt_id_fkey
    FOREIGN KEY (receipt_id) REFERENCES public.receipts(id);

ALTER TABLE ONLY public.fish_transactions
    ADD CONSTRAINT fish_transactions_storage_location_id_fkey
    FOREIGN KEY (storage_location_id) REFERENCES public.storage_locations(id);

ALTER TABLE ONLY public.fish_transactions
    ADD CONSTRAINT fish_transactions_vessel_id_fkey
    FOREIGN KEY (vessel_id) REFERENCES public.vessels(id);

ALTER TABLE ONLY public.fish_types
    ADD CONSTRAINT fish_types_canonical_fish_type_id_fkey
    FOREIGN KEY (canonical_fish_type_id) REFERENCES public.fish_types(id);

ALTER TABLE ONLY public.fish_types
    ADD CONSTRAINT fish_types_source_fish_type_id_fkey
    FOREIGN KEY (source_fish_type_id) REFERENCES public.fish_types(id);

ALTER TABLE ONLY public.installment_payments
    ADD CONSTRAINT installment_payments_schedule_id_fkey
    FOREIGN KEY (schedule_id) REFERENCES public.installment_schedules(id);

ALTER TABLE ONLY public.installment_schedules
    ADD CONSTRAINT installment_schedules_invoice_id_fkey
    FOREIGN KEY (invoice_id) REFERENCES public.invoices(id);

ALTER TABLE ONLY public.item_stock
    ADD CONSTRAINT item_stock_item_id_fkey
    FOREIGN KEY (item_id) REFERENCES public.items(id);

ALTER TABLE ONLY public.item_transactions
    ADD CONSTRAINT item_transactions_item_id_fkey
    FOREIGN KEY (item_id) REFERENCES public.items(id);

ALTER TABLE ONLY public.item_transactions
    ADD CONSTRAINT item_transactions_receipt_id_fkey
    FOREIGN KEY (receipt_id) REFERENCES public.receipts(id);

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_category_id_fkey
    FOREIGN KEY (category_id) REFERENCES public.item_categories(id);

ALTER TABLE ONLY public.review_field_changes
    ADD CONSTRAINT review_field_changes_receipt_id_fkey
    FOREIGN KEY (receipt_id) REFERENCES public.receipts(id);

ALTER TABLE ONLY public.sorting_operations
    ADD CONSTRAINT sorting_operations_receipt_id_fkey
    FOREIGN KEY (receipt_id) REFERENCES public.receipts(id);

ALTER TABLE ONLY public.sorting_operations
    ADD CONSTRAINT sorting_operations_source_fish_type_id_fkey
    FOREIGN KEY (source_fish_type_id) REFERENCES public.fish_types(id);

ALTER TABLE ONLY public.sorting_outputs
    ADD CONSTRAINT sorting_outputs_fish_type_id_fkey
    FOREIGN KEY (fish_type_id) REFERENCES public.fish_types(id);

ALTER TABLE ONLY public.sorting_outputs
    ADD CONSTRAINT sorting_outputs_sorting_operation_id_fkey
    FOREIGN KEY (sorting_operation_id) REFERENCES public.sorting_operations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.timbangan_records
    ADD CONSTRAINT timbangan_records_receipt_id_fkey
    FOREIGN KEY (receipt_id) REFERENCES public.receipts(id);

ALTER TABLE ONLY public.timbangan_records
    ADD CONSTRAINT timbangan_records_receipt_id_nullable_fkey
    FOREIGN KEY (receipt_id_nullable) REFERENCES public.receipts(id);

ALTER TABLE ONLY public.timbangan_records
    ADD CONSTRAINT timbangan_records_vessel_id_fkey
    FOREIGN KEY (vessel_id) REFERENCES public.vessels(id);

ALTER TABLE ONLY public.titipan_records
    ADD CONSTRAINT titipan_records_fish_type_id_fkey
    FOREIGN KEY (fish_type_id) REFERENCES public.fish_types(id);

ALTER TABLE ONLY public.titipan_transactions
    ADD CONSTRAINT titipan_transactions_titipan_id_fkey
    FOREIGN KEY (titipan_id) REFERENCES public.titipan_records(id);
