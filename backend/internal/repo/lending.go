package repo

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/samudera/fish-coldstorage/internal/domain"
)

type LendingRepo struct{ db *pgxpool.Pool }

func NewLendingRepo(db *pgxpool.Pool) *LendingRepo { return &LendingRepo{db: db} }

func (r *LendingRepo) List(ctx context.Context, status string) ([]domain.LendingRecord, error) {
	q := `SELECT id, person_id, COALESCE(person_name,''), amount, paid_amount,
		         lending_date, due_date, status, COALESCE(notes,''), direction, created_at
		  FROM lending_records`
	args := []interface{}{}
	if status != "" {
		q += ` WHERE status=$1`
		args = append(args, status)
	}
	q += ` ORDER BY lending_date DESC`

	rows, err := r.db.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.LendingRecord
	for rows.Next() {
		var l domain.LendingRecord
		if err := rows.Scan(&l.ID, &l.PersonID, &l.PersonName, &l.Amount, &l.PaidAmount,
			&l.LendingDate, &l.DueDate, &l.Status, &l.Notes, &l.Direction, &l.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

func (r *LendingRepo) GetByID(ctx context.Context, id uuid.UUID) (*domain.LendingRecord, error) {
	var l domain.LendingRecord
	err := r.db.QueryRow(ctx,
		`SELECT id, person_id, COALESCE(person_name,''), amount, paid_amount,
		        lending_date, due_date, status, COALESCE(notes,''), direction, created_at
		 FROM lending_records WHERE id=$1`, id).
		Scan(&l.ID, &l.PersonID, &l.PersonName, &l.Amount, &l.PaidAmount,
			&l.LendingDate, &l.DueDate, &l.Status, &l.Notes, &l.Direction, &l.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &l, nil
}

func (r *LendingRepo) Create(ctx context.Context, l *domain.LendingRecord) error {
	l.ID = uuid.New()
	l.PaidAmount = 0
	l.Status = "active"
	l.CreatedAt = time.Now()
	_, err := r.db.Exec(ctx,
		`INSERT INTO lending_records(id,person_id,person_name,amount,paid_amount,lending_date,due_date,status,notes,direction)
		 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		l.ID, l.PersonID, l.PersonName, l.Amount, l.PaidAmount, l.LendingDate, l.DueDate, l.Status, l.Notes, l.Direction)
	return err
}

func (r *LendingRepo) RecordPayment(ctx context.Context, id uuid.UUID, amount float64) error {
	_, err := r.db.Exec(ctx, `
		UPDATE lending_records
		SET paid_amount = paid_amount + $2,
		    status = CASE WHEN paid_amount + $2 >= amount THEN 'settled' ELSE 'partial' END
		WHERE id=$1`, id, amount)
	return err
}
