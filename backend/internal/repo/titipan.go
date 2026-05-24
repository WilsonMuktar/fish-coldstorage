package repo

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/samudera/fish-coldstorage/internal/domain"
)

type TitipanRepo struct{ db *pgxpool.Pool }

func NewTitipanRepo(db *pgxpool.Pool) *TitipanRepo { return &TitipanRepo{db: db} }

func (r *TitipanRepo) List(ctx context.Context, status string) ([]domain.TitipanRecord, error) {
	q := `SELECT id, person_id, COALESCE(person_name,''), fish_type_id, COALESCE(fish_code,''),
		         deposit_kg, remaining_kg, price_per_kg, deposit_date, status, COALESCE(notes,''), created_at
		  FROM titipan_records`
	args := []interface{}{}
	if status != "" {
		q += ` WHERE status=$1`
		args = append(args, status)
	}
	q += ` ORDER BY deposit_date DESC`

	rows, err := r.db.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.TitipanRecord
	for rows.Next() {
		var t domain.TitipanRecord
		if err := rows.Scan(&t.ID, &t.PersonID, &t.PersonName, &t.FishTypeID, &t.FishCode,
			&t.DepositKg, &t.RemainingKg, &t.PricePerKg, &t.DepositDate, &t.Status, &t.Notes, &t.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (r *TitipanRepo) GetByID(ctx context.Context, id uuid.UUID) (*domain.TitipanRecord, error) {
	var t domain.TitipanRecord
	err := r.db.QueryRow(ctx,
		`SELECT id, person_id, COALESCE(person_name,''), fish_type_id, COALESCE(fish_code,''),
		        deposit_kg, remaining_kg, price_per_kg, deposit_date, status, COALESCE(notes,''), created_at
		 FROM titipan_records WHERE id=$1`, id).
		Scan(&t.ID, &t.PersonID, &t.PersonName, &t.FishTypeID, &t.FishCode,
			&t.DepositKg, &t.RemainingKg, &t.PricePerKg, &t.DepositDate, &t.Status, &t.Notes, &t.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (r *TitipanRepo) Create(ctx context.Context, t *domain.TitipanRecord) error {
	t.ID = uuid.New()
	t.RemainingKg = t.DepositKg
	t.Status = "active"
	t.CreatedAt = time.Now()
	_, err := r.db.Exec(ctx,
		`INSERT INTO titipan_records(id,person_id,person_name,fish_type_id,fish_code,deposit_kg,remaining_kg,price_per_kg,deposit_date,status,notes)
		 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		t.ID, t.PersonID, t.PersonName, t.FishTypeID, t.FishCode,
		t.DepositKg, t.RemainingKg, t.PricePerKg, t.DepositDate, t.Status, t.Notes)
	return err
}

func (r *TitipanRepo) Withdraw(ctx context.Context, id uuid.UUID, kg float64, notes string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE titipan_records
		SET remaining_kg = remaining_kg - $2,
		    status = CASE WHEN remaining_kg - $2 <= 0 THEN 'completed' ELSE status END
		WHERE id=$1 AND remaining_kg >= $2`, id, kg)
	if err != nil {
		return err
	}
	tx := domain.TitipanTransaction{
		ID: uuid.New(), TitipanID: id, TransactionType: "withdrawal",
		Quantity: kg, Notes: notes, TransactionDate: time.Now(), CreatedAt: time.Now(),
	}
	_, err = r.db.Exec(ctx,
		`INSERT INTO titipan_transactions(id,titipan_id,transaction_type,quantity,notes,transaction_date)
		 VALUES($1,$2,$3,$4,$5,$6)`,
		tx.ID, tx.TitipanID, tx.TransactionType, tx.Quantity, tx.Notes, tx.TransactionDate)
	return err
}

func (r *TitipanRepo) ListTransactions(ctx context.Context, titipanID uuid.UUID) ([]domain.TitipanTransaction, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, titipan_id, transaction_type, quantity, COALESCE(notes,''), transaction_date, created_at
		 FROM titipan_transactions WHERE titipan_id=$1 ORDER BY transaction_date DESC`, titipanID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.TitipanTransaction
	for rows.Next() {
		var t domain.TitipanTransaction
		if err := rows.Scan(&t.ID, &t.TitipanID, &t.TransactionType, &t.Quantity, &t.Notes, &t.TransactionDate, &t.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}
