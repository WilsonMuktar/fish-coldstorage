package repo

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type TokenRepo struct{ db *pgxpool.Pool }

func NewTokenRepo(db *pgxpool.Pool) *TokenRepo { return &TokenRepo{db: db} }

func (r *TokenRepo) Store(ctx context.Context, userID, tokenHash string, expiresAt time.Time) error {
	_, err := r.db.Exec(ctx,
		`INSERT INTO refresh_tokens (user_id,token_hash,expires_at) VALUES ($1,$2,$3)`,
		userID, tokenHash, expiresAt)
	return err
}

func (r *TokenRepo) GetByHash(ctx context.Context, tokenHash string) (string, time.Time, bool, error) {
	var userID string
	var expiresAt time.Time
	var revoked bool
	err := r.db.QueryRow(ctx,
		`SELECT user_id,expires_at,revoked FROM refresh_tokens WHERE token_hash=$1`,
		tokenHash).Scan(&userID, &expiresAt, &revoked)
	if err != nil {
		return "", time.Time{}, false, fmt.Errorf("get token: %w", err)
	}
	return userID, expiresAt, revoked, nil
}

func (r *TokenRepo) Revoke(ctx context.Context, tokenHash string) error {
	_, err := r.db.Exec(ctx, `UPDATE refresh_tokens SET revoked=true WHERE token_hash=$1`, tokenHash)
	return err
}

func (r *TokenRepo) RevokeAllForUser(ctx context.Context, userID string) error {
	_, err := r.db.Exec(ctx, `UPDATE refresh_tokens SET revoked=true WHERE user_id=$1`, userID)
	return err
}
