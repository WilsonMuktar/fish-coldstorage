-- Migration 000002: sorted fish layer

-- Extend fish_types with grade/sorting metadata
ALTER TABLE fish_types
    ADD COLUMN IF NOT EXISTS is_sorted         BOOLEAN   NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS source_fish_type_id UUID     REFERENCES fish_types(id),
    ADD COLUMN IF NOT EXISTS grade             VARCHAR(30) DEFAULT '';

-- Sorting operations header
CREATE TABLE IF NOT EXISTS sorting_operations (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_fish_type_id UUID NOT NULL REFERENCES fish_types(id),
    input_kg          NUMERIC(12,2) NOT NULL,
    waste_kg          NUMERIC(12,2) NOT NULL DEFAULT 0,
    notes             TEXT,
    sort_date         DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by        UUID,
    created_by_name   VARCHAR(100),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-grade output lines
CREATE TABLE IF NOT EXISTS sorting_outputs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sorting_operation_id UUID NOT NULL REFERENCES sorting_operations(id) ON DELETE CASCADE,
    fish_type_id        UUID NOT NULL REFERENCES fish_types(id),
    output_kg           NUMERIC(12,2) NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sorting_ops_source ON sorting_operations(source_fish_type_id, sort_date);
CREATE INDEX IF NOT EXISTS idx_sorting_outputs_op ON sorting_outputs(sorting_operation_id);
CREATE INDEX IF NOT EXISTS idx_fish_types_source ON fish_types(source_fish_type_id) WHERE source_fish_type_id IS NOT NULL;
