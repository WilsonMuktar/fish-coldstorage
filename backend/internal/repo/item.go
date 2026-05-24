package repo

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/samudera/fish-coldstorage/internal/domain"
)

type ItemRepo struct{ db *pgxpool.Pool }

func NewItemRepo(db *pgxpool.Pool) *ItemRepo { return &ItemRepo{db: db} }

func (r *ItemRepo) ListCategories(ctx context.Context) ([]domain.ItemCategory, error) {
	rows, err := r.db.Query(ctx, `SELECT id, name, created_at FROM item_categories ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.ItemCategory
	for rows.Next() {
		var c domain.ItemCategory
		if err := rows.Scan(&c.ID, &c.Name, &c.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *ItemRepo) ListItems(ctx context.Context) ([]domain.Item, error) {
	rows, err := r.db.Query(ctx, `
		SELECT i.id, i.code, i.name, i.category_id, COALESCE(c.name,''),
		       i.unit, i.price_estimate, i.is_active, i.created_at
		FROM items i
		LEFT JOIN item_categories c ON c.id = i.category_id
		WHERE i.is_active = true
		ORDER BY i.code`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Item
	for rows.Next() {
		var it domain.Item
		if err := rows.Scan(&it.ID, &it.Code, &it.Name, &it.CategoryID, &it.CategoryName,
			&it.Unit, &it.PriceEstimate, &it.IsActive, &it.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

func (r *ItemRepo) CreateItem(ctx context.Context, code, name, unit string, categoryID *uuid.UUID, priceEstimate float64) (*domain.Item, error) {
	it := domain.Item{ID: uuid.New(), Code: code, Name: name, Unit: unit, CategoryID: categoryID, PriceEstimate: priceEstimate, IsActive: true, CreatedAt: time.Now()}
	_, err := r.db.Exec(ctx,
		`INSERT INTO items(id,code,name,unit,category_id,price_estimate,is_active) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (code) DO NOTHING`,
		it.ID, it.Code, it.Name, it.Unit, it.CategoryID, it.PriceEstimate, it.IsActive)
	if err != nil {
		return nil, err
	}
	return &it, nil
}

func (r *ItemRepo) UpdateItem(ctx context.Context, id uuid.UUID, name, unit string, categoryID *uuid.UUID, priceEstimate float64) error {
	_, err := r.db.Exec(ctx,
		`UPDATE items SET name=$1, unit=$2, category_id=$3, price_estimate=$4 WHERE id=$5`,
		name, unit, categoryID, priceEstimate, id)
	return err
}

func (r *ItemRepo) DeleteItem(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.Exec(ctx, `UPDATE items SET is_active=false WHERE id=$1`, id)
	return err
}

func (r *ItemRepo) GetItemByName(ctx context.Context, name string) (*domain.Item, error) {
	var it domain.Item
	err := r.db.QueryRow(ctx, `
		SELECT i.id, i.code, i.name, i.category_id, COALESCE(c.name,''),
		       i.unit, i.price_estimate, i.is_active, i.created_at
		FROM items i LEFT JOIN item_categories c ON c.id = i.category_id
		WHERE LOWER(i.name) = LOWER($1) AND i.is_active = true
		LIMIT 1`, name).Scan(
		&it.ID, &it.Code, &it.Name, &it.CategoryID, &it.CategoryName,
		&it.Unit, &it.PriceEstimate, &it.IsActive, &it.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &it, nil
}

func (r *ItemRepo) GetItemByID(ctx context.Context, id uuid.UUID) (*domain.Item, error) {
	var it domain.Item
	err := r.db.QueryRow(ctx, `
		SELECT i.id, i.code, i.name, i.category_id, COALESCE(c.name,''),
		       i.unit, i.price_estimate, i.is_active, i.created_at
		FROM items i LEFT JOIN item_categories c ON c.id = i.category_id
		WHERE i.id=$1`, id).
		Scan(&it.ID, &it.Code, &it.Name, &it.CategoryID, &it.CategoryName,
			&it.Unit, &it.PriceEstimate, &it.IsActive, &it.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &it, nil
}

func (r *ItemRepo) ListStock(ctx context.Context) ([]domain.ItemStock, error) {
	rows, err := r.db.Query(ctx, `
		SELECT i.id, i.id, i.code, i.name, COALESCE(c.name,''), i.unit, NULL::uuid,
		       COALESCE(SUM(ist.quantity), 0), MAX(ist.updated_at)
		FROM items i
		LEFT JOIN item_categories c ON c.id = i.category_id
		LEFT JOIN item_stock ist ON ist.item_id = i.id
		WHERE i.is_active = true
		GROUP BY i.id, i.code, i.name, c.name, i.unit
		ORDER BY i.name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.ItemStock
	for rows.Next() {
		var s domain.ItemStock
		if err := rows.Scan(&s.ID, &s.ItemID, &s.ItemCode, &s.ItemName, &s.CategoryName, &s.Unit, &s.StorageLocationID, &s.Quantity, &s.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (r *ItemRepo) ListTransactions(ctx context.Context, limit, offset int, itemID *uuid.UUID) ([]domain.ItemTransaction, error) {
	where := ""
	args := []interface{}{limit, offset}
	if itemID != nil {
		where = "WHERE it.item_id = $3"
		args = append(args, *itemID)
	}
	rows, err := r.db.Query(ctx, `
		SELECT it.id, it.item_id, i.name, it.transaction_type,
		       it.quantity, it.unit_price, it.total_amount,
		       it.person_id, COALESCE(it.person_name,''), it.receipt_id,
		       COALESCE(rec.review_token,''),
		       COALESCE(it.notes,''), it.transaction_date, it.created_at
		FROM item_transactions it
		JOIN items i ON i.id = it.item_id
		LEFT JOIN receipts rec ON rec.id = it.receipt_id
		`+where+`
		ORDER BY it.transaction_date DESC, it.created_at DESC
		LIMIT $1 OFFSET $2`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.ItemTransaction
	for rows.Next() {
		var t domain.ItemTransaction
		if err := rows.Scan(
			&t.ID, &t.ItemID, &t.ItemName, &t.TransactionType,
			&t.Quantity, &t.UnitPrice, &t.TotalAmount,
			&t.PersonID, &t.PersonName, &t.ReceiptID,
			&t.ReviewToken,
			&t.Notes, &t.TransactionDate, &t.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (r *ItemRepo) CreateTransaction(ctx context.Context, t *domain.ItemTransaction) error {
	t.ID = uuid.New()
	t.CreatedAt = time.Now()
	_, err := r.db.Exec(ctx, `
		INSERT INTO item_transactions(id,item_id,transaction_type,quantity,unit_price,total_amount,
			person_id,person_name,receipt_id,notes,transaction_date)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		t.ID, t.ItemID, t.TransactionType, t.Quantity, t.UnitPrice, t.TotalAmount,
		t.PersonID, t.PersonName, t.ReceiptID, t.Notes, t.TransactionDate)
	return err
}

func (r *ItemRepo) UpsertStock(ctx context.Context, itemID uuid.UUID, locationID *uuid.UUID, delta float64) error {
	locID := uuid.Nil
	if locationID != nil {
		locID = *locationID
	}
	_, err := r.db.Exec(ctx, `
		INSERT INTO item_stock(id, item_id, storage_location_id, quantity, updated_at)
		VALUES($1, $2, $3, $4, NOW())
		ON CONFLICT (item_id, storage_location_id) DO UPDATE
		SET quantity = item_stock.quantity + EXCLUDED.quantity, updated_at = NOW()`,
		uuid.New(), itemID, locID, delta)
	return err
}
