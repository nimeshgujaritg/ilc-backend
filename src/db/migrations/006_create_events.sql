CREATE TABLE IF NOT EXISTS events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          VARCHAR(255) NOT NULL,
  date           DATE NOT NULL,
  time           TIME,
  location       VARCHAR(255),
  description    TEXT,
  capacity       INTEGER,
  calendly_link  VARCHAR(500),
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW()
);