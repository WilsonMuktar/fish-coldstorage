CREATE TABLE IF NOT EXISTS audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id),
  action       VARCHAR(30) NOT NULL,
  entity_type  VARCHAR(50),
  entity_id    UUID,
  before_state JSONB,
  after_state  JSONB,
  ip_address   VARCHAR(50),
  source       VARCHAR(20) DEFAULT 'web',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
