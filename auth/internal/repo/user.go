package repo

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/samudera/auth-service/internal/domain"
)

type UserRepo struct{ db *pgxpool.Pool }

func NewUserRepo(db *pgxpool.Pool) *UserRepo { return &UserRepo{db: db} }

const userSelect = `SELECT id,person_id,display_name,COALESCE(telegram_id,0),role,user_type,is_active,COALESCE(created_by::text,''),created_at,updated_at,last_login_at FROM users`

func scanUser(row interface{ Scan(...any) error }) (*domain.User, error) {
	u := &domain.User{}
	err := row.Scan(&u.ID, &u.PersonID, &u.DisplayName, &u.TelegramID, &u.Role, &u.UserType,
		&u.IsActive, &u.CreatedBy, &u.CreatedAt, &u.UpdatedAt, &u.LastLoginAt)
	return u, err
}

func (r *UserRepo) Create(ctx context.Context, personID, displayName, role, userType, passwordHash, createdBy string) (*domain.User, error) {
	var createdByArg interface{} = nil
	if createdBy != "" {
		createdByArg = createdBy
	}
	u := &domain.User{}
	err := r.db.QueryRow(ctx, `
		INSERT INTO users (person_id,display_name,role,user_type,password_hash,created_by)
		VALUES ($1,$2,$3,$4,$5,$6)
		RETURNING id,person_id,display_name,COALESCE(telegram_id,0),role,user_type,is_active,COALESCE(created_by::text,''),created_at,updated_at,last_login_at`,
		personID, displayName, role, userType, passwordHash, createdByArg,
	).Scan(&u.ID, &u.PersonID, &u.DisplayName, &u.TelegramID, &u.Role, &u.UserType,
		&u.IsActive, &u.CreatedBy, &u.CreatedAt, &u.UpdatedAt, &u.LastLoginAt)
	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}
	return u, nil
}

func (r *UserRepo) GetByID(ctx context.Context, id string) (*domain.User, error) {
	u := &domain.User{}
	err := r.db.QueryRow(ctx, userSelect+` WHERE id=$1`, id).
		Scan(&u.ID, &u.PersonID, &u.DisplayName, &u.TelegramID, &u.Role, &u.UserType,
			&u.IsActive, &u.CreatedBy, &u.CreatedAt, &u.UpdatedAt, &u.LastLoginAt)
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}
	return u, nil
}

func (r *UserRepo) GetByPersonID(ctx context.Context, personID string) (*domain.User, error) {
	u := &domain.User{}
	err := r.db.QueryRow(ctx, userSelect+` WHERE person_id=$1`, personID).
		Scan(&u.ID, &u.PersonID, &u.DisplayName, &u.TelegramID, &u.Role, &u.UserType,
			&u.IsActive, &u.CreatedBy, &u.CreatedAt, &u.UpdatedAt, &u.LastLoginAt)
	if err != nil {
		return nil, fmt.Errorf("get user by person: %w", err)
	}
	return u, nil
}

func (r *UserRepo) GetByTelegram(ctx context.Context, telegramID int64) (*domain.User, error) {
	u := &domain.User{}
	err := r.db.QueryRow(ctx, userSelect+` WHERE telegram_id=$1`, telegramID).
		Scan(&u.ID, &u.PersonID, &u.DisplayName, &u.TelegramID, &u.Role, &u.UserType,
			&u.IsActive, &u.CreatedBy, &u.CreatedAt, &u.UpdatedAt, &u.LastLoginAt)
	if err != nil {
		return nil, fmt.Errorf("get user by telegram: %w", err)
	}
	return u, nil
}

func (r *UserRepo) GetPasswordHash(ctx context.Context, userID string) (string, error) {
	var h string
	err := r.db.QueryRow(ctx, `SELECT COALESCE(password_hash,'') FROM users WHERE id=$1`, userID).Scan(&h)
	return h, err
}

func (r *UserRepo) List(ctx context.Context) ([]*domain.User, error) {
	rows, err := r.db.Query(ctx, userSelect+` ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []*domain.User
	for rows.Next() {
		u := &domain.User{}
		if err := rows.Scan(&u.ID, &u.PersonID, &u.DisplayName, &u.TelegramID, &u.Role, &u.UserType,
			&u.IsActive, &u.CreatedBy, &u.CreatedAt, &u.UpdatedAt, &u.LastLoginAt); err != nil {
			return nil, err
		}
		list = append(list, u)
	}
	return list, nil
}

func (r *UserRepo) Update(ctx context.Context, id string, req *domain.UpdateUserRequest) (*domain.User, error) {
	u := &domain.User{}
	err := r.db.QueryRow(ctx, `
		UPDATE users SET display_name=COALESCE(NULLIF($1,''),display_name),
		role=COALESCE(NULLIF($2,''),role), user_type=COALESCE(NULLIF($3,''),user_type),
		updated_at=NOW() WHERE id=$4
		RETURNING id,person_id,display_name,COALESCE(telegram_id,0),role,user_type,is_active,COALESCE(created_by::text,''),created_at,updated_at,last_login_at`,
		req.DisplayName, req.Role, req.UserType, id,
	).Scan(&u.ID, &u.PersonID, &u.DisplayName, &u.TelegramID, &u.Role, &u.UserType,
		&u.IsActive, &u.CreatedBy, &u.CreatedAt, &u.UpdatedAt, &u.LastLoginAt)
	if err != nil {
		return nil, fmt.Errorf("update user: %w", err)
	}
	return u, nil
}

func (r *UserRepo) UpdatePassword(ctx context.Context, id, hash string) error {
	_, err := r.db.Exec(ctx, `UPDATE users SET password_hash=$1,updated_at=NOW() WHERE id=$2`, hash, id)
	return err
}

func (r *UserRepo) UpdateTelegram(ctx context.Context, id string, telegramID int64) (*domain.User, error) {
	u := &domain.User{}
	err := r.db.QueryRow(ctx, `
		UPDATE users SET telegram_id=$1,updated_at=NOW() WHERE id=$2
		RETURNING id,person_id,display_name,COALESCE(telegram_id,0),role,user_type,is_active,COALESCE(created_by::text,''),created_at,updated_at,last_login_at`,
		telegramID, id,
	).Scan(&u.ID, &u.PersonID, &u.DisplayName, &u.TelegramID, &u.Role, &u.UserType,
		&u.IsActive, &u.CreatedBy, &u.CreatedAt, &u.UpdatedAt, &u.LastLoginAt)
	if err != nil {
		return nil, fmt.Errorf("update telegram: %w", err)
	}
	return u, nil
}

func (r *UserRepo) Deactivate(ctx context.Context, id string) (*domain.User, error) {
	u := &domain.User{}
	err := r.db.QueryRow(ctx, `
		UPDATE users SET is_active=false,updated_at=NOW() WHERE id=$1
		RETURNING id,person_id,display_name,COALESCE(telegram_id,0),role,user_type,is_active,COALESCE(created_by::text,''),created_at,updated_at,last_login_at`,
		id,
	).Scan(&u.ID, &u.PersonID, &u.DisplayName, &u.TelegramID, &u.Role, &u.UserType,
		&u.IsActive, &u.CreatedBy, &u.CreatedAt, &u.UpdatedAt, &u.LastLoginAt)
	if err != nil {
		return nil, fmt.Errorf("deactivate user: %w", err)
	}
	return u, nil
}

func (r *UserRepo) UpdateLastLogin(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `UPDATE users SET last_login_at=NOW() WHERE id=$1`, id)
	return err
}
