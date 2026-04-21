CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE user_role AS ENUM ('CEO', 'ADMIN');
CREATE TYPE profile_status AS ENUM ('PENDING', 'SUBMITTED', 'APPROVED');

CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email             VARCHAR(255) UNIQUE NOT NULL,
  password_hash     VARCHAR(255) NOT NULL,
  name              VARCHAR(255) NOT NULL,
  title             VARCHAR(255),
  initials          VARCHAR(3),
  role              user_role NOT NULL DEFAULT 'CEO',
  is_first_login    BOOLEAN NOT NULL DEFAULT true,
  profile_status    profile_status NOT NULL DEFAULT 'PENDING',
  gf_entry_id       INTEGER,
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();