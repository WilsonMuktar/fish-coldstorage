package audit

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/samudera/fish-coldstorage/internal/middleware"
)

type Log struct {
	db *pgxpool.Pool
}

func New(db *pgxpool.Pool) *Log { return &Log{db: db} }

// Record writes one audit entry. Pass the incoming *http.Request so actor identity
// can be extracted from the JWT claims set by JWTMiddleware.
func (l *Log) Record(ctx context.Context, r *http.Request, entityType, action string, entityID uuid.UUID, changes interface{}) {
	var actorID *uuid.UUID
	var actorName string

	if r != nil {
		if claims := middleware.GetClaims(r); claims != nil {
			if id, err := uuid.Parse(claims.PersonID); err == nil {
				actorID = &id
			}
			actorName = claims.Name
			if actorName == "" {
				actorName = claims.UserID
			}
			if claims.Role != "" {
				actorName += " (" + claims.Role + ")"
			}
		}
	}

	var changesJSON []byte
	if changes != nil {
		changesJSON, _ = json.Marshal(changes)
	}

	_, _ = l.db.Exec(ctx,
		`INSERT INTO audit_logs(id, entity_type, entity_id, action, actor_id, actor_name, changes)
		 VALUES($1,$2,$3,$4,$5,$6,$7)`,
		uuid.New(), entityType, entityID, action, actorID, actorName, changesJSON)
}

// List returns audit entries newest-first. entityType is an optional filter ("" = all).
func (l *Log) List(ctx context.Context, entityType string, limit, offset int) ([]Entry, error) {
	var (
		query string
		args  []interface{}
	)
	if entityType != "" {
		query = `SELECT id, entity_type, entity_id, action,
		                COALESCE(actor_id, '00000000-0000-0000-0000-000000000000'::uuid),
		                COALESCE(actor_name,''), COALESCE(changes,'null'::jsonb), created_at
		         FROM audit_logs WHERE entity_type=$1
		         ORDER BY created_at DESC LIMIT $2 OFFSET $3`
		args = []interface{}{entityType, limit, offset}
	} else {
		query = `SELECT id, entity_type, entity_id, action,
		                COALESCE(actor_id, '00000000-0000-0000-0000-000000000000'::uuid),
		                COALESCE(actor_name,''), COALESCE(changes,'null'::jsonb), created_at
		         FROM audit_logs
		         ORDER BY created_at DESC LIMIT $1 OFFSET $2`
		args = []interface{}{limit, offset}
	}

	rows, err := l.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Entry
	for rows.Next() {
		var e Entry
		if err := rows.Scan(&e.ID, &e.EntityType, &e.EntityID, &e.Action,
			&e.ActorID, &e.ActorName, &e.Changes, &e.CreatedAt); err != nil {
			return nil, err
		}
		// zero UUID means NULL — normalise back to nil
		if e.ActorID != nil && *e.ActorID == uuid.Nil {
			e.ActorID = nil
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// Count returns total rows (optionally filtered by entityType).
func (l *Log) Count(ctx context.Context, entityType string) (int, error) {
	var n int
	if entityType != "" {
		err := l.db.QueryRow(ctx, `SELECT COUNT(*) FROM audit_logs WHERE entity_type=$1`, entityType).Scan(&n)
		return n, err
	}
	err := l.db.QueryRow(ctx, `SELECT COUNT(*) FROM audit_logs`).Scan(&n)
	return n, err
}
