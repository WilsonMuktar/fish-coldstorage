-- Link alias fish types to a canonical (primary) entry.
-- When canonical_fish_type_id IS NOT NULL, this row is an alias and its stock
-- rolls up into the canonical row for display purposes.
ALTER TABLE fish_types
    ADD COLUMN IF NOT EXISTS canonical_fish_type_id UUID REFERENCES fish_types(id);

CREATE INDEX IF NOT EXISTS idx_fish_types_canonical ON fish_types(canonical_fish_type_id)
    WHERE canonical_fish_type_id IS NOT NULL;
