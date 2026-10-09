-- Up塾 junior English word app: D1 only. Do not run against Render/Postgres.
-- Store pseudonymous student IDs; never store plaintext passwords or session tokens.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS junior_students (
  student_id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 600000,
  must_change_password INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0,1)),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until_ms INTEGER NOT NULL DEFAULT 0,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS junior_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  student_id TEXT NOT NULL REFERENCES junior_students(student_id) ON DELETE CASCADE,
  created_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  revoked_at_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_junior_sessions_student ON junior_sessions(student_id);

CREATE TABLE IF NOT EXISTS junior_attempts (
  student_id TEXT NOT NULL REFERENCES junior_students(student_id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('word','chunk','phrase','definition')),
  question_key TEXT NOT NULL,
  is_correct INTEGER NOT NULL CHECK (is_correct IN (0,1)),
  active_ms INTEGER NOT NULL CHECK (active_ms BETWEEN 0 AND 120000),
  received_at_ms INTEGER NOT NULL,
  PRIMARY KEY(student_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_junior_attempts_student_date ON junior_attempts(student_id, received_at_ms);
CREATE INDEX IF NOT EXISTS idx_junior_attempts_date ON junior_attempts(received_at_ms);

-- Schema version is tracked by Cloudflare D1 migration tables through Wrangler.
