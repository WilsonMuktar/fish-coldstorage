CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id     UUID NOT NULL REFERENCES peoples(person_id),
  display_name  VARCHAR(100),
  telegram_id   BIGINT UNIQUE,
  role          VARCHAR(20) NOT NULL DEFAULT 'default' CHECK (role IN ('admin','manager','default')),
  user_type     VARCHAR(20) NOT NULL DEFAULT 'worker' CHECK (user_type IN ('owner','manager','vendor','partner','captain','worker')),
  password_hash VARCHAR(255),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  UNIQUE (person_id)
);
CREATE INDEX IF NOT EXISTS idx_users_person_id   ON users(person_id);
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
