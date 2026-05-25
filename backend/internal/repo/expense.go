package repo

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/samudera/fish-coldstorage/internal/domain"
)

type ExpenseRepo struct {
	db *pgxpool.Pool
}

func NewExpenseRepo(db *pgxpool.Pool) *ExpenseRepo {
	return &ExpenseRepo{db: db}
}

func (r *ExpenseRepo) Create(ctx context.Context, e *domain.Expense) error {
	return r.db.QueryRow(ctx,
		`INSERT INTO expenses (date, category, description, amount, notes, receipt_id, photo_path)
		 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, created_at`,
		e.Date, e.Category, e.Description, e.Amount, e.Notes, e.ReceiptID, e.PhotoPath,
	).Scan(&e.ID, &e.CreatedAt)
}

func (r *ExpenseRepo) GetByID(ctx context.Context, id uuid.UUID) (*domain.Expense, error) {
	var e domain.Expense
	err := r.db.QueryRow(ctx,
		`SELECT id, date, category, COALESCE(description,''), amount, COALESCE(notes,''), COALESCE(photo_path,''), created_at FROM expenses WHERE id=$1`, id).
		Scan(&e.ID, &e.Date, &e.Category, &e.Description, &e.Amount, &e.Notes, &e.PhotoPath, &e.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &e, nil
}

func (r *ExpenseRepo) UpdatePhoto(ctx context.Context, id uuid.UUID, photoPath string) error {
	_, err := r.db.Exec(ctx, `UPDATE expenses SET photo_path = $1 WHERE id = $2`, photoPath, id)
	return err
}

func (r *ExpenseRepo) List(ctx context.Context, category string, from, to *time.Time, limit, offset int) ([]domain.Expense, error) {
	args := []interface{}{}
	where := "WHERE 1=1"
	i := 1
	if category != "" {
		where += fmt.Sprintf(" AND e.category = $%d", i)
		args = append(args, category)
		i++
	}
	if from != nil {
		where += fmt.Sprintf(" AND e.date >= $%d", i)
		args = append(args, *from)
		i++
	}
	if to != nil {
		where += fmt.Sprintf(" AND e.date < $%d", i)
		args = append(args, *to)
		i++
	}
	if limit <= 0 {
		limit = 100
	}
	args = append(args, limit, offset)
	rows, err := r.db.Query(ctx,
		fmt.Sprintf(`SELECT e.id, e.date, e.category, e.description, e.amount, e.notes,
		                    e.receipt_id, COALESCE(rec.review_token, ''), e.photo_path, e.created_at
		             FROM expenses e
		             LEFT JOIN receipts rec ON rec.id = e.receipt_id
		             %s ORDER BY e.date DESC, e.created_at DESC LIMIT $%d OFFSET $%d`, where, i, i+1),
		args...,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Expense
	for rows.Next() {
		var e domain.Expense
		if err := rows.Scan(&e.ID, &e.Date, &e.Category, &e.Description, &e.Amount, &e.Notes, &e.ReceiptID, &e.ReviewToken, &e.PhotoPath, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (r *ExpenseRepo) SumByPeriod(ctx context.Context, from, to *time.Time) (float64, error) {
	args := []interface{}{}
	where := "WHERE 1=1"
	i := 1
	if from != nil {
		where += fmt.Sprintf(" AND date >= $%d", i)
		args = append(args, *from)
		i++
	}
	if to != nil {
		where += fmt.Sprintf(" AND date < $%d", i)
		args = append(args, *to)
		i++
	}
	_ = i
	var total float64
	err := r.db.QueryRow(ctx,
		fmt.Sprintf(`SELECT COALESCE(SUM(amount), 0) FROM expenses %s`, where),
		args...,
	).Scan(&total)
	return total, err
}
