package repo

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/samudera/fish-coldstorage/internal/domain"
)

type SortingRepo struct{ db *pgxpool.Pool }

func NewSortingRepo(db *pgxpool.Pool) *SortingRepo { return &SortingRepo{db: db} }

// CreateOperation records a sort: deducts raw stock, adds graded stock, inserts rows.
func (r *SortingRepo) CreateOperation(ctx context.Context, op *domain.SortingOperation, fishRepo *FishRepo) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	op.ID = uuid.New()
	op.CreatedAt = time.Now()

	_, err = tx.Exec(ctx,
		`INSERT INTO sorting_operations(id,source_fish_type_id,input_kg,waste_kg,notes,sort_date,created_by_name,receipt_id,created_at)
		 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		op.ID, op.SourceFishTypeID, op.InputKg, op.WasteKg, op.Notes, op.SortDate, op.CreatedByName, op.ReceiptID, op.CreatedAt)
	if err != nil {
		return err
	}

	for i := range op.Outputs {
		op.Outputs[i].ID = uuid.New()
		op.Outputs[i].SortingOperationID = op.ID
		_, err = tx.Exec(ctx,
			`INSERT INTO sorting_outputs(id,sorting_operation_id,fish_type_id,output_kg)
			 VALUES($1,$2,$3,$4)`,
			op.Outputs[i].ID, op.ID, op.Outputs[i].FishTypeID, op.Outputs[i].OutputKg)
		if err != nil {
			return err
		}
	}

	// Deduct raw fish stock
	locID := uuid.Nil
	_, err = tx.Exec(ctx, `
		INSERT INTO fish_stock(id,fish_type_id,storage_location_id,quantity,updated_at)
		VALUES($1,$2,$3,$4,NOW())
		ON CONFLICT (fish_type_id,storage_location_id) DO UPDATE
		SET quantity=fish_stock.quantity+EXCLUDED.quantity, updated_at=NOW()`,
		uuid.New(), op.SourceFishTypeID, locID, -op.InputKg)
	if err != nil {
		return err
	}

	// Add graded stock per output
	for _, out := range op.Outputs {
		_, err = tx.Exec(ctx, `
			INSERT INTO fish_stock(id,fish_type_id,storage_location_id,quantity,updated_at)
			VALUES($1,$2,$3,$4,NOW())
			ON CONFLICT (fish_type_id,storage_location_id) DO UPDATE
			SET quantity=fish_stock.quantity+EXCLUDED.quantity, updated_at=NOW()`,
			uuid.New(), out.FishTypeID, locID, out.OutputKg)
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

// InsertOperationOnly writes sorting_operations + sorting_outputs rows without touching stock.
// Use when stock has already been updated by the caller (e.g. processSortir in ReviewService).
func (r *SortingRepo) InsertOperationOnly(ctx context.Context, op *domain.SortingOperation) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	op.ID = uuid.New()
	op.CreatedAt = time.Now()

	_, err = tx.Exec(ctx,
		`INSERT INTO sorting_operations(id,source_fish_type_id,input_kg,waste_kg,notes,sort_date,created_by_name,receipt_id,created_at)
		 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		op.ID, op.SourceFishTypeID, op.InputKg, op.WasteKg, op.Notes, op.SortDate, op.CreatedByName, op.ReceiptID, op.CreatedAt)
	if err != nil {
		return err
	}

	for i := range op.Outputs {
		op.Outputs[i].ID = uuid.New()
		op.Outputs[i].SortingOperationID = op.ID
		_, err = tx.Exec(ctx,
			`INSERT INTO sorting_outputs(id,sorting_operation_id,fish_type_id,output_kg)
			 VALUES($1,$2,$3,$4)`,
			op.Outputs[i].ID, op.ID, op.Outputs[i].FishTypeID, op.Outputs[i].OutputKg)
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func (r *SortingRepo) List(ctx context.Context, limit, offset int) ([]domain.SortingOperation, error) {
	rows, err := r.db.Query(ctx, `
		SELECT so.id, so.source_fish_type_id, ft.code, ft.name,
		       so.input_kg, so.waste_kg, COALESCE(so.notes,''),
		       so.sort_date, COALESCE(so.created_by_name,''),
		       so.receipt_id, COALESCE(rec.review_token,''),
		       so.created_at
		FROM sorting_operations so
		JOIN fish_types ft ON ft.id = so.source_fish_type_id
		LEFT JOIN receipts rec ON rec.id = so.receipt_id
		ORDER BY so.sort_date DESC, so.created_at DESC
		LIMIT $1 OFFSET $2`, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ops []domain.SortingOperation
	for rows.Next() {
		var op domain.SortingOperation
		if err := rows.Scan(&op.ID, &op.SourceFishTypeID, &op.SourceFishTypeCode, &op.SourceFishTypeName,
			&op.InputKg, &op.WasteKg, &op.Notes, &op.SortDate, &op.CreatedByName,
			&op.ReceiptID, &op.ReviewToken,
			&op.CreatedAt); err != nil {
			return nil, err
		}
		ops = append(ops, op)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Load outputs for all ops in one query
	if len(ops) == 0 {
		return ops, nil
	}
	ids := make([]uuid.UUID, len(ops))
	idx := make(map[uuid.UUID]int, len(ops))
	for i, op := range ops {
		ids[i] = op.ID
		idx[op.ID] = i
	}
	outRows, err := r.db.Query(ctx, `
		SELECT sout.id, sout.sorting_operation_id, sout.fish_type_id,
		       ft.code, ft.name, sout.output_kg
		FROM sorting_outputs sout
		JOIN fish_types ft ON ft.id = sout.fish_type_id
		WHERE sout.sorting_operation_id = ANY($1)
		ORDER BY sout.created_at`, pgx.QueryResultFormats{pgx.BinaryFormatCode}, ids)
	if err != nil {
		return nil, err
	}
	defer outRows.Close()
	for outRows.Next() {
		var o domain.SortingOutput
		if err := outRows.Scan(&o.ID, &o.SortingOperationID, &o.FishTypeID, &o.FishTypeCode, &o.FishTypeName, &o.OutputKg); err != nil {
			return nil, err
		}
		if i, ok := idx[o.SortingOperationID]; ok {
			ops[i].Outputs = append(ops[i].Outputs, o)
		}
	}
	return ops, outRows.Err()
}

func (r *SortingRepo) Count(ctx context.Context) (int, error) {
	var n int
	err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM sorting_operations`).Scan(&n)
	return n, err
}

// ListByFishType returns sorting ops where the fish type was source OR an output.
// role: "source" | "output" | "" (both)
func (r *SortingRepo) ListByFishType(ctx context.Context, fishTypeID uuid.UUID) ([]domain.SortingOperation, error) {
	rows, err := r.db.Query(ctx, `
		SELECT DISTINCT so.id, so.source_fish_type_id, ft.code, ft.name,
		       so.input_kg, so.waste_kg, COALESCE(so.notes,''),
		       so.sort_date, COALESCE(so.created_by_name,''),
		       so.receipt_id, COALESCE(rec.review_token,''),
		       so.created_at
		FROM sorting_operations so
		JOIN fish_types ft ON ft.id = so.source_fish_type_id
		LEFT JOIN receipts rec ON rec.id = so.receipt_id
		WHERE so.source_fish_type_id = $1
		   OR so.id IN (SELECT sorting_operation_id FROM sorting_outputs WHERE fish_type_id = $1)
		   OR so.id IN (
		       SELECT sout2.sorting_operation_id
		       FROM sorting_outputs sout2
		       JOIN fish_types ft2 ON ft2.id = sout2.fish_type_id
		       WHERE ft2.source_fish_type_id = $1
		   )
		ORDER BY so.sort_date DESC, so.created_at DESC`, fishTypeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ops []domain.SortingOperation
	for rows.Next() {
		var op domain.SortingOperation
		if err := rows.Scan(&op.ID, &op.SourceFishTypeID, &op.SourceFishTypeCode, &op.SourceFishTypeName,
			&op.InputKg, &op.WasteKg, &op.Notes, &op.SortDate, &op.CreatedByName,
			&op.ReceiptID, &op.ReviewToken,
			&op.CreatedAt); err != nil {
			return nil, err
		}
		ops = append(ops, op)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(ops) == 0 {
		return ops, nil
	}

	ids := make([]uuid.UUID, len(ops))
	idx := make(map[uuid.UUID]int, len(ops))
	for i, op := range ops {
		ids[i] = op.ID
		idx[op.ID] = i
	}
	outRows, err := r.db.Query(ctx, `
		SELECT sout.id, sout.sorting_operation_id, sout.fish_type_id,
		       ft.code, ft.name, sout.output_kg
		FROM sorting_outputs sout
		JOIN fish_types ft ON ft.id = sout.fish_type_id
		WHERE sout.sorting_operation_id = ANY($1)
		ORDER BY sout.created_at`, pgx.QueryResultFormats{pgx.BinaryFormatCode}, ids)
	if err != nil {
		return nil, err
	}
	defer outRows.Close()
	for outRows.Next() {
		var o domain.SortingOutput
		if err := outRows.Scan(&o.ID, &o.SortingOperationID, &o.FishTypeID, &o.FishTypeCode, &o.FishTypeName, &o.OutputKg); err != nil {
			return nil, err
		}
		if i, ok := idx[o.SortingOperationID]; ok {
			ops[i].Outputs = append(ops[i].Outputs, o)
		}
	}
	return ops, outRows.Err()
}
