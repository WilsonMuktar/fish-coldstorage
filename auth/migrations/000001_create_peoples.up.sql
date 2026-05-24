CREATE TABLE IF NOT EXISTS peoples (
  person_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_category   VARCHAR(50),
  first_name        VARCHAR(255) NOT NULL,
  last_name         VARCHAR(255) NOT NULL,
  email             VARCHAR(255),
  phone_number      VARCHAR(20),
  address           VARCHAR(255),
  city              VARCHAR(100),
  state             VARCHAR(100),
  country           VARCHAR(100),
  postal_code       VARCHAR(20),
  person_image_path VARCHAR(500),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_peoples_phone    ON peoples(phone_number);
CREATE INDEX IF NOT EXISTS idx_peoples_category ON peoples(person_category);
CREATE INDEX IF NOT EXISTS idx_peoples_name     ON peoples(last_name, first_name);
