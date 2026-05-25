package repo

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/samudera/fish-coldstorage/internal/domain"
)

type EmployeeRepo struct{ db *pgxpool.Pool }

func NewEmployeeRepo(db *pgxpool.Pool) *EmployeeRepo { return &EmployeeRepo{db: db} }

func (r *EmployeeRepo) List(ctx context.Context) ([]domain.Employee, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id, person_id, name, COALESCE(position,''), COALESCE(phone,''), daily_salary, is_active, hired_at, created_at
		 FROM employees ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Employee
	for rows.Next() {
		var e domain.Employee
		if err := rows.Scan(&e.ID, &e.PersonID, &e.Name, &e.Position, &e.Phone, &e.DailySalary, &e.IsActive, &e.HiredAt, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (r *EmployeeRepo) GetByID(ctx context.Context, id uuid.UUID) (*domain.Employee, error) {
	var e domain.Employee
	err := r.db.QueryRow(ctx,
		`SELECT id, person_id, name, COALESCE(position,''), COALESCE(phone,''), daily_salary, is_active, hired_at, created_at
		 FROM employees WHERE id=$1`, id).
		Scan(&e.ID, &e.PersonID, &e.Name, &e.Position, &e.Phone, &e.DailySalary, &e.IsActive, &e.HiredAt, &e.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &e, nil
}

func (r *EmployeeRepo) Create(ctx context.Context, e *domain.Employee) error {
	e.ID = uuid.New()
	e.IsActive = true
	e.CreatedAt = time.Now()
	_, err := r.db.Exec(ctx,
		`INSERT INTO employees(id,person_id,name,position,phone,daily_salary,is_active,hired_at)
		 VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
		e.ID, e.PersonID, e.Name, e.Position, e.Phone, e.DailySalary, e.IsActive, e.HiredAt)
	return err
}

func (r *EmployeeRepo) Update(ctx context.Context, e *domain.Employee) error {
	_, err := r.db.Exec(ctx,
		`UPDATE employees SET name=$2, position=$3, phone=$4, daily_salary=$5, is_active=$6, hired_at=$7 WHERE id=$1`,
		e.ID, e.Name, e.Position, e.Phone, e.DailySalary, e.IsActive, e.HiredAt)
	return err
}

func (r *EmployeeRepo) ListAttendance(ctx context.Context, date time.Time) ([]domain.AttendanceRecord, error) {
	rows, err := r.db.Query(ctx, `
		SELECT a.id, a.employee_id, e.name, a.attend_date, a.shift, a.present, COALESCE(a.notes,''), a.created_at
		FROM attendance a
		JOIN employees e ON e.id = a.employee_id
		WHERE a.attend_date = $1
		ORDER BY e.name, a.shift`, date)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.AttendanceRecord
	for rows.Next() {
		var a domain.AttendanceRecord
		if err := rows.Scan(&a.ID, &a.EmployeeID, &a.EmployeeName, &a.AttendDate, &a.Shift, &a.Present, &a.Notes, &a.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (r *EmployeeRepo) ListAttendanceRange(ctx context.Context, from, to time.Time) ([]domain.AttendanceRecord, error) {
	rows, err := r.db.Query(ctx, `
		SELECT a.id, a.employee_id, e.name, a.attend_date, a.shift, a.present, COALESCE(a.notes,''), a.created_at
		FROM attendance a
		JOIN employees e ON e.id = a.employee_id
		WHERE a.attend_date >= $1 AND a.attend_date <= $2
		ORDER BY e.name, a.attend_date, a.shift`, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.AttendanceRecord
	for rows.Next() {
		var a domain.AttendanceRecord
		if err := rows.Scan(&a.ID, &a.EmployeeID, &a.EmployeeName, &a.AttendDate, &a.Shift, &a.Present, &a.Notes, &a.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (r *EmployeeRepo) UpsertAttendance(ctx context.Context, recs []domain.AttendanceRecord) error {
	for i := range recs {
		if recs[i].ID == uuid.Nil {
			recs[i].ID = uuid.New()
		}
		if recs[i].Shift == 0 {
			recs[i].Shift = 1
		}
		recs[i].CreatedAt = time.Now()
		_, err := r.db.Exec(ctx, `
			INSERT INTO attendance(id,employee_id,attend_date,shift,present,notes)
			VALUES($1,$2,$3,$4,$5,$6)
			ON CONFLICT(employee_id, attend_date, shift) DO UPDATE
			SET present=EXCLUDED.present, notes=EXCLUDED.notes`,
			recs[i].ID, recs[i].EmployeeID, recs[i].AttendDate, recs[i].Shift, recs[i].Present, recs[i].Notes)
		if err != nil {
			return err
		}
	}
	return nil
}
