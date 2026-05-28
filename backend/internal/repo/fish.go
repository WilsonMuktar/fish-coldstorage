package repo

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/samudera/fish-coldstorage/internal/domain"
)

type FishRepo struct{ db *pgxpool.Pool }

func NewFishRepo(db *pgxpool.Pool) *FishRepo { return &FishRepo{db: db} }

func (r *FishRepo) ListTypes(ctx context.Context) ([]domain.FishType, error) {
	rows, err := r.db.Query(ctx, `
		SELECT ft.id, ft.code, ft.name, COALESCE(ft.description,''),
		       COALESCE(ft.aliases,''), COALESCE(ft.photo_path,''), ft.is_active,
		       COALESCE(ft.is_sorted,false), ft.source_fish_type_id, COALESCE(ft.grade,''),
		       COALESCE(src.code,''), ft.canonical_fish_type_id, ft.created_at
		FROM fish_types ft
		LEFT JOIN fish_types src ON src.id = ft.source_fish_type_id
		WHERE ft.is_active=true ORDER BY ft.code`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.FishType
	for rows.Next() {
		var f domain.FishType
		if err := rows.Scan(&f.ID, &f.Code, &f.Name, &f.Description, &f.Aliases, &f.PhotoPath,
			&f.IsActive, &f.IsSorted, &f.SourceFishTypeID, &f.Grade, &f.SourceFishTypeCode,
			&f.CanonicalFishTypeID, &f.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

func (r *FishRepo) GetTypeByCode(ctx context.Context, code string) (*domain.FishType, error) {
	var f domain.FishType
	err := r.db.QueryRow(ctx, `
		SELECT ft.id, ft.code, ft.name, COALESCE(ft.description,''),
		       COALESCE(ft.aliases,''), COALESCE(ft.photo_path,''), ft.is_active,
		       COALESCE(ft.is_sorted,false), ft.source_fish_type_id, COALESCE(ft.grade,''),
		       COALESCE(src.code,''), ft.canonical_fish_type_id, ft.created_at
		FROM fish_types ft
		LEFT JOIN fish_types src ON src.id = ft.source_fish_type_id
		WHERE (ft.code=$1 OR ft.aliases ILIKE '%'||$1||'%')
		  AND (ft.is_active = true OR ft.canonical_fish_type_id IS NOT NULL)
		ORDER BY (ft.code=$1) DESC LIMIT 1`, code).
		Scan(&f.ID, &f.Code, &f.Name, &f.Description, &f.Aliases, &f.PhotoPath,
			&f.IsActive, &f.IsSorted, &f.SourceFishTypeID, &f.Grade, &f.SourceFishTypeCode,
			&f.CanonicalFishTypeID, &f.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &f, nil
}

type StockInfo struct {
	AvailableKg float64
	IsSorted    bool
	Exists      bool
}

func (r *FishRepo) GetStockByCode(ctx context.Context, code string) (*StockInfo, error) {
	var info StockInfo
	// Match the requested code against: (1) exact code, (2) the code appears in
	// another row's aliases, (3) the matched row's own aliases match another row's code.
	// This lets BDR find BH's stock when BH.aliases='BDR', and vice versa.
	err := r.db.QueryRow(ctx, `
		WITH primary_row AS (
			SELECT id, is_sorted, aliases
			FROM fish_types
			WHERE code = $1
			ORDER BY is_active DESC
			LIMIT 1
		),
		alias_codes AS (
			-- split primary row's own aliases into individual codes
			SELECT TRIM(unnest(string_to_array(aliases, ','))) AS alias_code
			FROM primary_row
			WHERE aliases IS NOT NULL AND aliases <> ''
		),
		matching_ids AS (
			-- the primary row itself
			SELECT id FROM primary_row
			UNION
			-- rows whose aliases contain our code
			SELECT ft.id FROM fish_types ft
			WHERE ft.is_active = true
			  AND EXISTS (
				SELECT 1 FROM unnest(string_to_array(ft.aliases, ',')) a
				WHERE TRIM(a) = $1
			  )
			UNION
			-- rows whose code matches one of primary row's aliases
			SELECT ft.id FROM fish_types ft
			JOIN alias_codes ac ON ft.code = ac.alias_code
			WHERE ft.is_active = true
		)
		SELECT pr.is_sorted, COALESCE(SUM(fs.quantity), 0)
		FROM primary_row pr
		LEFT JOIN matching_ids mi ON true
		LEFT JOIN fish_stock fs ON fs.fish_type_id = mi.id
		GROUP BY pr.is_sorted`, code).Scan(&info.IsSorted, &info.AvailableKg)
	if err != nil {
		return &StockInfo{Exists: false}, nil // code not found
	}
	info.Exists = true
	return &info, nil
}

func (r *FishRepo) CreateType(ctx context.Context, code, name, desc string, isSorted bool, sourceFishTypeID *uuid.UUID, grade string) (*domain.FishType, error) {
	f := domain.FishType{
		ID: uuid.New(), Code: code, Name: name, Description: desc,
		IsActive: true, IsSorted: isSorted, SourceFishTypeID: sourceFishTypeID, Grade: grade,
		CreatedAt: time.Now(),
	}
	_, err := r.db.Exec(ctx,
		`INSERT INTO fish_types(id,code,name,description,is_active,is_sorted,source_fish_type_id,grade)
		 VALUES($1,$2,$3,$4,$5,$6,$7,$8)
		 ON CONFLICT (code) DO NOTHING`,
		f.ID, f.Code, f.Name, f.Description, f.IsActive, f.IsSorted, f.SourceFishTypeID, f.Grade)
	if err != nil {
		return nil, err
	}
	return &f, nil
}

// GetTypeByCodeOrAlias returns the fish_type row for the given code, falling
// back to any row whose aliases column contains the code. Among candidates it
// prefers the row with the largest current stock so deductions land on the
// right bucket.
func (r *FishRepo) GetTypeByCodeOrAlias(ctx context.Context, code string) (*domain.FishType, error) {
	var f domain.FishType
	err := r.db.QueryRow(ctx, `
		SELECT ft.id, ft.code, ft.name, COALESCE(ft.description,''),
		       COALESCE(ft.aliases,''), COALESCE(ft.photo_path,''), ft.is_active,
		       COALESCE(ft.is_sorted,false), ft.source_fish_type_id, COALESCE(ft.grade,''),
		       COALESCE(src.code,''), ft.canonical_fish_type_id, ft.created_at
		FROM fish_types ft
		LEFT JOIN fish_types src ON src.id = ft.source_fish_type_id
		LEFT JOIN fish_stock fs ON fs.fish_type_id = ft.id
		WHERE ft.is_active = true
		  AND (
		    ft.code = $1
		    OR EXISTS (
		        SELECT 1 FROM unnest(string_to_array(ft.aliases,',')) a WHERE TRIM(a) = $1
		    )
		  )
		ORDER BY COALESCE(fs.quantity, 0) DESC
		LIMIT 1`,
		code).
		Scan(&f.ID, &f.Code, &f.Name, &f.Description, &f.Aliases, &f.PhotoPath,
			&f.IsActive, &f.IsSorted, &f.SourceFishTypeID, &f.Grade, &f.SourceFishTypeCode,
			&f.CanonicalFishTypeID, &f.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &f, nil
}

func (r *FishRepo) UpdateType(ctx context.Context, id uuid.UUID, name, desc, aliases, photoPath string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE fish_types SET name=$1, description=$2, aliases=$3, photo_path=$4 WHERE id=$5`,
		name, desc, aliases, photoPath, id)
	return err
}

func (r *FishRepo) DeleteType(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.Exec(ctx, `UPDATE fish_types SET is_active=false WHERE id=$1`, id)
	return err
}

func (r *FishRepo) GetTypeByID(ctx context.Context, id uuid.UUID) (*domain.FishType, error) {
	var f domain.FishType
	err := r.db.QueryRow(ctx, `
		SELECT ft.id, ft.code, ft.name, COALESCE(ft.description,''),
		       COALESCE(ft.aliases,''), COALESCE(ft.photo_path,''), ft.is_active,
		       COALESCE(ft.is_sorted,false), ft.source_fish_type_id, COALESCE(ft.grade,''),
		       COALESCE(src.code,''), ft.canonical_fish_type_id, ft.created_at
		FROM fish_types ft
		LEFT JOIN fish_types src ON src.id = ft.source_fish_type_id
		WHERE ft.id=$1`, id).
		Scan(&f.ID, &f.Code, &f.Name, &f.Description, &f.Aliases, &f.PhotoPath,
			&f.IsActive, &f.IsSorted, &f.SourceFishTypeID, &f.Grade, &f.SourceFishTypeCode,
			&f.CanonicalFishTypeID, &f.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &f, nil
}

func (r *FishRepo) ListStock(ctx context.Context) ([]domain.FishStockSummary, error) {
	// Each row is keyed by the "display" fish type: either the canonical row (if
	// this type has aliases pointing to it) or the type itself (no canonical set).
	// Alias rows (canonical_fish_type_id IS NOT NULL) are excluded from the outer
	// list — their stock is summed into the canonical row.
	rows, err := r.db.Query(ctx, `
		WITH grouped AS (
			SELECT
				COALESCE(ft.canonical_fish_type_id, ft.id) AS display_id,
				ft.id                                       AS ft_id,
				ft.is_sorted                                AS is_sorted,
				COALESCE(SUM(fs.quantity), 0)               AS qty,
				MAX(fs.updated_at)                          AS updated_at
			FROM fish_types ft
			LEFT JOIN fish_stock fs ON fs.fish_type_id = ft.id
			WHERE ft.is_active = true OR ft.canonical_fish_type_id IS NOT NULL
			GROUP BY ft.canonical_fish_type_id, ft.id
		),
		sorted_stock AS (
			SELECT
				COALESCE(ft.source_fish_type_id, ft.canonical_fish_type_id) AS source_id,
				COALESCE(SUM(fs.quantity), 0) AS sorted_qty
			FROM fish_types ft
			LEFT JOIN fish_stock fs ON fs.fish_type_id = ft.id
			WHERE ft.is_sorted = true
			GROUP BY COALESCE(ft.source_fish_type_id, ft.canonical_fish_type_id)
		),
		sold AS (
			SELECT
				COALESCE(ft.canonical_fish_type_id, ft.id) AS display_id,
				COALESCE(SUM(tx.quantity), 0) AS sold_qty
			FROM fish_transactions tx
			JOIN fish_types ft ON ft.id = tx.fish_type_id
			WHERE tx.transaction_type = 'sell'
			GROUP BY COALESCE(ft.canonical_fish_type_id, ft.id)
		)
		SELECT
			canon.id::text,
			canon.code,
			canon.name,
			canon.code || COALESCE(
				(SELECT ' / ' || string_agg(a.code, ' / ' ORDER BY a.code)
				 FROM fish_types a
				 WHERE a.canonical_fish_type_id = canon.id),
				''
			) AS all_codes,
			COALESCE(SUM(g.qty), 0)          AS total_qty,
			COALESCE(ss.sorted_qty, 0)        AS sorted_kg,
			COALESCE(so.sold_qty, 0)          AS sold_kg,
			MAX(g.updated_at)                 AS updated_at
		FROM grouped g
		JOIN fish_types canon ON canon.id = g.display_id
		LEFT JOIN sorted_stock ss ON ss.source_id = canon.id
		LEFT JOIN sold so ON so.display_id = canon.id
		WHERE canon.is_active = true
		  AND canon.canonical_fish_type_id IS NULL
		GROUP BY canon.id, canon.code, canon.name, ss.sorted_qty, so.sold_qty
		ORDER BY canon.code`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.FishStockSummary
	for rows.Next() {
		var s domain.FishStockSummary
		if err := rows.Scan(&s.FishTypeID, &s.FishCode, &s.FishName, &s.AllCodes, &s.TotalQuantity, &s.SortedKg, &s.SoldKg, &s.UpdatedAt); err != nil {
			return nil, err
		}
		// Only set AllCodes if it's actually a grouped display (more than one code)
		if s.AllCodes == s.FishCode {
			s.AllCodes = ""
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// UpdateCanonical sets or clears the canonical_fish_type_id for a fish type.
// Pass nil to clear (make it a standalone type again).
func (r *FishRepo) UpdateCanonical(ctx context.Context, id uuid.UUID, canonicalID *uuid.UUID) error {
	_, err := r.db.Exec(ctx,
		`UPDATE fish_types SET canonical_fish_type_id=$1 WHERE id=$2`,
		canonicalID, id)
	return err
}

// StockTotals returns total kg grouped by is_sorted flag.
func (r *FishRepo) StockTotals(ctx context.Context) (rawKg, sortedKg float64, err error) {
	rows, err := r.db.Query(ctx, `
		SELECT COALESCE(ft.is_sorted, false), COALESCE(SUM(fs.quantity), 0)
		FROM fish_types ft
		LEFT JOIN fish_stock fs ON fs.fish_type_id = ft.id
		WHERE ft.is_active = true
		GROUP BY COALESCE(ft.is_sorted, false)`)
	if err != nil {
		return 0, 0, err
	}
	defer rows.Close()
	for rows.Next() {
		var isSorted bool
		var kg float64
		if err := rows.Scan(&isSorted, &kg); err != nil {
			return 0, 0, err
		}
		if isSorted {
			sortedKg = kg
		} else {
			rawKg = kg
		}
	}
	return rawKg, sortedKg, rows.Err()
}

func (r *FishRepo) UpsertStock(ctx context.Context, _ interface{}, fishTypeID uuid.UUID, locationID *uuid.UUID, deltaKg float64) error {
	locID := uuid.Nil
	if locationID != nil {
		locID = *locationID
	}
	_, err := r.db.Exec(ctx, `
		INSERT INTO fish_stock(id, fish_type_id, storage_location_id, quantity, updated_at)
		VALUES($1, $2, $3, $4, NOW())
		ON CONFLICT (fish_type_id, storage_location_id) DO UPDATE
		SET quantity = fish_stock.quantity + EXCLUDED.quantity, updated_at = NOW()`,
		uuid.New(), fishTypeID, locID, deltaKg)
	return err
}

func (r *FishRepo) ListTransactions(ctx context.Context, limit, offset int, fishTypeID *uuid.UUID) ([]domain.FishTransaction, int, error) {
	var whereClause string
	args := []interface{}{limit, offset}
	if fishTypeID != nil {
		whereClause = "WHERE ft.fish_type_id = $3"
		args = append(args, *fishTypeID)
	}

	rows, err := r.db.Query(ctx, `
		SELECT ft.id, ft.fish_type_id, fty.code, ft.transaction_type,
		       ft.quantity, ft.price_per_kg, ft.total_amount,
		       ft.person_id, COALESCE(ft.person_name,''), ft.vessel_id, COALESCE(ft.vessel_name,''),
		       ft.receipt_id, COALESCE(rec.review_token,''), COALESCE(rec.image_path,''),
		       ft.storage_location_id, COALESCE(ft.notes,''),
		       ft.transaction_date, ft.created_at
		FROM fish_transactions ft
		JOIN fish_types fty ON fty.id = ft.fish_type_id
		LEFT JOIN receipts rec ON rec.id = ft.receipt_id
		`+whereClause+`
		ORDER BY ft.transaction_date DESC, ft.created_at DESC
		LIMIT $1 OFFSET $2`, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var out []domain.FishTransaction
	for rows.Next() {
		var t domain.FishTransaction
		if err := rows.Scan(
			&t.ID, &t.FishTypeID, &t.FishCode, &t.TransactionType,
			&t.Quantity, &t.PricePerKg, &t.TotalAmount,
			&t.PersonID, &t.PersonName, &t.VesselID, &t.VesselName,
			&t.ReceiptID, &t.ReviewToken, &t.ReceiptImagePath,
			&t.StorageLocationID, &t.Notes,
			&t.TransactionDate, &t.CreatedAt,
		); err != nil {
			return nil, 0, err
		}
		out = append(out, t)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}

	// count
	countArgs := []interface{}{}
	countWhere := ""
	if fishTypeID != nil {
		countWhere = "WHERE fish_type_id = $1"
		countArgs = append(countArgs, *fishTypeID)
	}
	var total int
	_ = r.db.QueryRow(ctx, "SELECT COUNT(*) FROM fish_transactions "+countWhere, countArgs...).Scan(&total)

	return out, total, nil
}

func (r *FishRepo) CreateTransaction(ctx context.Context, t *domain.FishTransaction) error {
	t.ID = uuid.New()
	t.CreatedAt = time.Now()
	_, err := r.db.Exec(ctx, `
		INSERT INTO fish_transactions(id,fish_type_id,transaction_type,quantity,price_per_kg,total_amount,
			person_id,person_name,vessel_id,vessel_name,receipt_id,storage_location_id,notes,transaction_date)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
		t.ID, t.FishTypeID, t.TransactionType, t.Quantity, t.PricePerKg, t.TotalAmount,
		t.PersonID, t.PersonName, t.VesselID, t.VesselName, t.ReceiptID, t.StorageLocationID,
		t.Notes, t.TransactionDate)
	return err
}

func (r *FishRepo) ListVessels(ctx context.Context) ([]domain.Vessel, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, name, COALESCE(registration_no,''), owner_person_id, COALESCE(owner_name,''), COALESCE(captain_name,''), COALESCE(photo_path,''), is_active, created_at
		 FROM vessels ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Vessel
	for rows.Next() {
		var v domain.Vessel
		if err := rows.Scan(&v.ID, &v.Name, &v.RegistrationNo, &v.OwnerPersonID, &v.OwnerName, &v.CaptainName, &v.PhotoPath, &v.IsActive, &v.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

func (r *FishRepo) CreateVessel(ctx context.Context, v *domain.Vessel) error {
	v.ID = uuid.New()
	v.IsActive = true
	v.CreatedAt = time.Now()
	_, err := r.db.Exec(ctx,
		`INSERT INTO vessels(id,name,registration_no,owner_person_id,owner_name,captain_name,is_active)
		 VALUES($1,$2,$3,$4,$5,$6,$7)`,
		v.ID, v.Name, v.RegistrationNo, v.OwnerPersonID, v.OwnerName, v.CaptainName, v.IsActive)
	return err
}

func (r *FishRepo) UpdateVessel(ctx context.Context, id uuid.UUID, name, registrationNo, captainName, ownerName string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE vessels SET name=$1, registration_no=$2, captain_name=$3, owner_name=$4 WHERE id=$5`,
		name, registrationNo, captainName, ownerName, id)
	return err
}

func (r *FishRepo) GetVesselByName(ctx context.Context, name string) (*domain.Vessel, error) {
	var v domain.Vessel
	err := r.db.QueryRow(ctx,
		`SELECT id, name, COALESCE(registration_no,''), owner_person_id, COALESCE(owner_name,''), COALESCE(captain_name,''), COALESCE(photo_path,''), is_active, created_at
		 FROM vessels WHERE LOWER(name) = LOWER($1) LIMIT 1`, name).
		Scan(&v.ID, &v.Name, &v.RegistrationNo, &v.OwnerPersonID, &v.OwnerName, &v.CaptainName, &v.PhotoPath, &v.IsActive, &v.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &v, nil
}

func (r *FishRepo) GetVesselByID(ctx context.Context, id uuid.UUID) (*domain.Vessel, error) {
	var v domain.Vessel
	err := r.db.QueryRow(ctx,
		`SELECT id, name, COALESCE(registration_no,''), owner_person_id, COALESCE(owner_name,''), COALESCE(captain_name,''), COALESCE(photo_path,''), is_active, created_at
		 FROM vessels WHERE id=$1`, id).
		Scan(&v.ID, &v.Name, &v.RegistrationNo, &v.OwnerPersonID, &v.OwnerName, &v.CaptainName, &v.PhotoPath, &v.IsActive, &v.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &v, nil
}

func (r *FishRepo) UpdateVesselPhoto(ctx context.Context, id uuid.UUID, photoPath string) error {
	_, err := r.db.Exec(ctx, `UPDATE vessels SET photo_path=$1 WHERE id=$2`, photoPath, id)
	return err
}

func (r *FishRepo) CreateTimbanganRecord(ctx context.Context, t *domain.TimbanganRecord) error {
	t.ID = uuid.New()
	t.ReceiptID = uuid.New() // placeholder receipt for manually-created records
	t.CreatedAt = time.Now()
	if t.FishColumns == nil {
		t.FishColumns = json.RawMessage("[]")
	}
	_, err := r.db.Exec(ctx,
		`INSERT INTO timbangan_records(id, receipt_id, vessel_id, vessel_name, transports, timbang_date, total_weight_kg, fish_columns)
		 VALUES($1, $2, $3, $4, $5, $6, $7, $8)`,
		t.ID, t.ReceiptID, t.VesselID, t.VesselName, t.Transports, t.TimbangDate, t.TotalWeightKg, t.FishColumns)
	return err
}

// InsertTimbanganRecord inserts a record linked to a real receipt (called after bot receipt approval).
func (r *FishRepo) InsertTimbanganRecord(ctx context.Context, t *domain.TimbanganRecord) error {
	t.ID = uuid.New()
	t.CreatedAt = time.Now()
	if t.FishColumns == nil {
		t.FishColumns = json.RawMessage("[]")
	}
	_, err := r.db.Exec(ctx,
		`INSERT INTO timbangan_records(id, receipt_id, vessel_id, vessel_name, transports, timbang_date, total_weight_kg, fish_columns)
		 VALUES($1, $2, $3, $4, $5, $6, $7, $8)`,
		t.ID, t.ReceiptID, t.VesselID, t.VesselName, t.Transports, t.TimbangDate, t.TotalWeightKg, t.FishColumns)
	return err
}

func (r *FishRepo) ListTimbanganRecords(ctx context.Context, limit, offset int) ([]domain.TimbanganRecord, error) {
	rows, err := r.db.Query(ctx,
		`SELECT tr.id, tr.receipt_id, COALESCE(rec.review_token,''),
		        tr.vessel_id, tr.vessel_name, COALESCE(tr.transports,''),
		        tr.timbang_date, tr.total_weight_kg, COALESCE(tr.fish_columns,'[]'::jsonb),
		        COALESCE(tr.status,'approved'), tr.created_at
		 FROM timbangan_records tr
		 LEFT JOIN receipts rec ON rec.id = tr.receipt_id
		 ORDER BY tr.timbang_date DESC, tr.created_at DESC LIMIT $1 OFFSET $2`, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.TimbanganRecord
	for rows.Next() {
		var t domain.TimbanganRecord
		if err := rows.Scan(&t.ID, &t.ReceiptID, &t.ReviewToken,
			&t.VesselID, &t.VesselName, &t.Transports,
			&t.TimbangDate, &t.TotalWeightKg, &t.FishColumns, &t.Status, &t.CreatedAt); err != nil {
			return nil, err
		}
		t.TransportNumber = t.Transports
		t.WeighDate = t.TimbangDate.Format("2006-01-02")
		t.TotalKg = t.TotalWeightKg
		out = append(out, t)
	}
	return out, rows.Err()
}

// ListTimbanganForPicker returns all timbangan for the beli_ikan picker (many-to-many allowed).
func (r *FishRepo) ListTimbanganForPicker(ctx context.Context) ([]domain.TimbanganRecord, error) {
	rows, err := r.db.Query(ctx,
		`SELECT tr.id, tr.receipt_id, COALESCE(rec.review_token,''),
		        tr.vessel_id, tr.vessel_name, COALESCE(tr.transports,''),
		        tr.timbang_date, tr.total_weight_kg, COALESCE(tr.fish_columns,'[]'::jsonb),
		        COALESCE(tr.status,'approved'), tr.created_at
		 FROM timbangan_records tr
		 LEFT JOIN receipts rec ON rec.id = tr.receipt_id
		 ORDER BY tr.timbang_date DESC, tr.created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.TimbanganRecord
	for rows.Next() {
		var t domain.TimbanganRecord
		if err := rows.Scan(&t.ID, &t.ReceiptID, &t.ReviewToken,
			&t.VesselID, &t.VesselName, &t.Transports,
			&t.TimbangDate, &t.TotalWeightKg, &t.FishColumns, &t.Status, &t.CreatedAt); err != nil {
			return nil, err
		}
		t.TransportNumber = t.Transports
		t.WeighDate = t.TimbangDate.Format("2006-01-02")
		t.TotalKg = t.TotalWeightKg
		out = append(out, t)
	}
	return out, rows.Err()
}
