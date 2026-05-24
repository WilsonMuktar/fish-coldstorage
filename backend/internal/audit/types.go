package audit

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type Entry struct {
	ID         uuid.UUID       `json:"id"`
	EntityType string          `json:"entity_type"`
	EntityID   uuid.UUID       `json:"entity_id"`
	Action     string          `json:"action"`
	ActorID    *uuid.UUID      `json:"actor_id,omitempty"`
	ActorName  string          `json:"actor_name,omitempty"`
	Changes    json.RawMessage `json:"changes,omitempty"`
	CreatedAt  time.Time       `json:"created_at"`
}
