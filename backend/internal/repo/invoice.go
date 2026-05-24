package repo

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/samudera/fish-coldstorage/internal/domain"
)

type InvoiceRepo struct{ db *pgxpool.Pool }

func NewInvoiceRepo(db *pgxpool.Pool) *InvoiceRepo { return &InvoiceRepo{db: db} }

func (r *InvoiceRepo) List(ctx context.Context, invoiceType string, limit, offset int) ([]domain.Invoice, error) {
	q := `SELECT id, invoice_no, person_id, COALESCE(person_name,''), invoice_type,
		         total_amount, paid_amount, due_date, status, COALESCE(notes,''), issued_at, created_at
		  FROM invoices`
	args := []interface{}{}
	if invoiceType != "" {
		q += fmt.Sprintf(` WHERE invoice_type=$%d`, len(args)+1)
		args = append(args, invoiceType)
	}
	q += fmt.Sprintf(` ORDER BY created_at DESC LIMIT $%d OFFSET $%d`, len(args)+1, len(args)+2)
	args = append(args, limit, offset)

	pgRows, err := r.db.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer pgRows.Close()
	var out []domain.Invoice
	for pgRows.Next() {
		var inv domain.Invoice
		if err := pgRows.Scan(&inv.ID, &inv.InvoiceNo, &inv.PersonID, &inv.PersonName,
			&inv.InvoiceType, &inv.TotalAmount, &inv.PaidAmount, &inv.DueDate,
			&inv.Status, &inv.Notes, &inv.IssuedAt, &inv.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, inv)
	}
	return out, pgRows.Err()
}

func (r *InvoiceRepo) GetByID(ctx context.Context, id uuid.UUID) (*domain.Invoice, error) {
	var inv domain.Invoice
	err := r.db.QueryRow(ctx,
		`SELECT id, invoice_no, person_id, COALESCE(person_name,''), invoice_type,
		        total_amount, paid_amount, due_date, status, COALESCE(notes,''), issued_at, created_at
		 FROM invoices WHERE id=$1`, id).
		Scan(&inv.ID, &inv.InvoiceNo, &inv.PersonID, &inv.PersonName,
			&inv.InvoiceType, &inv.TotalAmount, &inv.PaidAmount, &inv.DueDate,
			&inv.Status, &inv.Notes, &inv.IssuedAt, &inv.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &inv, nil
}

func (r *InvoiceRepo) Create(ctx context.Context, inv *domain.Invoice) error {
	inv.ID = uuid.New()
	inv.CreatedAt = time.Now()
	inv.PaidAmount = 0
	if inv.Status == "" {
		inv.Status = "draft"
	}
	_, err := r.db.Exec(ctx,
		`INSERT INTO invoices(id,invoice_no,person_id,person_name,invoice_type,total_amount,paid_amount,due_date,status,notes,issued_at)
		 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		inv.ID, inv.InvoiceNo, inv.PersonID, inv.PersonName, inv.InvoiceType,
		inv.TotalAmount, inv.PaidAmount, inv.DueDate, inv.Status, inv.Notes, inv.IssuedAt)
	return err
}

func (r *InvoiceRepo) UpdateStatus(ctx context.Context, id uuid.UUID, status string) error {
	_, err := r.db.Exec(ctx, `UPDATE invoices SET status=$2 WHERE id=$1`, id, status)
	return err
}

func (r *InvoiceRepo) AddPayment(ctx context.Context, id uuid.UUID, amount float64) error {
	_, err := r.db.Exec(ctx, `
		UPDATE invoices
		SET paid_amount = paid_amount + $2,
		    status = CASE WHEN paid_amount + $2 >= total_amount THEN 'paid'
		                 WHEN paid_amount + $2 > 0 THEN 'partial'
		                 ELSE status END
		WHERE id=$1`, id, amount)
	return err
}

func (r *InvoiceRepo) ListSchedules(ctx context.Context, invoiceID uuid.UUID) ([]domain.InstallmentSchedule, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, invoice_id, due_date, amount_due, amount_paid, paid_at, status, COALESCE(notes,''), created_at
		 FROM installment_schedules WHERE invoice_id=$1 ORDER BY due_date`, invoiceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.InstallmentSchedule
	for rows.Next() {
		var s domain.InstallmentSchedule
		if err := rows.Scan(&s.ID, &s.InvoiceID, &s.DueDate, &s.AmountDue, &s.AmountPaid, &s.PaidAt, &s.Status, &s.Notes, &s.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (r *InvoiceRepo) CreateSchedule(ctx context.Context, s *domain.InstallmentSchedule) error {
	s.ID = uuid.New()
	s.CreatedAt = time.Now()
	s.Status = "pending"
	_, err := r.db.Exec(ctx,
		`INSERT INTO installment_schedules(id,invoice_id,due_date,amount_due,amount_paid,status,notes)
		 VALUES($1,$2,$3,$4,$5,$6,$7)`,
		s.ID, s.InvoiceID, s.DueDate, s.AmountDue, 0, s.Status, s.Notes)
	return err
}

func (r *InvoiceRepo) PaySchedule(ctx context.Context, scheduleID uuid.UUID, amount float64) error {
	now := time.Now()
	_, err := r.db.Exec(ctx, `
		UPDATE installment_schedules
		SET amount_paid = amount_paid + $2,
		    status = CASE WHEN amount_paid + $2 >= amount_due THEN 'paid' ELSE 'partial' END,
		    paid_at = CASE WHEN amount_paid + $2 >= amount_due THEN $3 ELSE paid_at END
		WHERE id=$1`, scheduleID, amount, now)
	return err
}

func (r *InvoiceRepo) ListAllSchedules(ctx context.Context, limit, offset int) ([]domain.InstallmentSchedule, error) {
	rows, err := r.db.Query(ctx, `
		SELECT s.id, s.invoice_id, s.due_date, s.amount_due, s.amount_paid, s.paid_at,
		       s.status, COALESCE(s.notes,''), s.created_at,
		       i.invoice_no, COALESCE(i.person_name,''), i.invoice_type
		FROM installment_schedules s
		JOIN invoices i ON i.id = s.invoice_id
		ORDER BY s.due_date
		LIMIT $1 OFFSET $2`, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.InstallmentSchedule
	for rows.Next() {
		var s domain.InstallmentSchedule
		if err := rows.Scan(&s.ID, &s.InvoiceID, &s.DueDate, &s.AmountDue, &s.AmountPaid, &s.PaidAt,
			&s.Status, &s.Notes, &s.CreatedAt, &s.InvoiceNo, &s.PersonName, &s.InvoiceType); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (r *InvoiceRepo) SumAR(ctx context.Context) (float64, error) {
	var total float64
	err := r.db.QueryRow(ctx,
		`SELECT COALESCE(SUM(total_amount - paid_amount), 0) FROM invoices WHERE invoice_type='ar' AND status NOT IN ('paid','cancelled')`).
		Scan(&total)
	return total, err
}

func (r *InvoiceRepo) SumAP(ctx context.Context) (float64, error) {
	var total float64
	err := r.db.QueryRow(ctx,
		`SELECT COALESCE(SUM(total_amount - paid_amount), 0) FROM invoices WHERE invoice_type='ap' AND status NOT IN ('paid','cancelled')`).
		Scan(&total)
	return total, err
}
