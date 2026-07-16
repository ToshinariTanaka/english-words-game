CREATE SEQUENCE IF NOT EXISTS member_number_seq AS BIGINT START WITH 1 INCREMENT BY 1 NO CYCLE;

CREATE TABLE IF NOT EXISTS administrators (
  id BIGSERIAL PRIMARY KEY,
  login_id VARCHAR(64) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  role VARCHAR(16) NOT NULL CHECK (role IN ('owner', 'admin', 'viewer')),
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  failed_login_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
  locked_until TIMESTAMPTZ,
  session_version INTEGER NOT NULL DEFAULT 1 CHECK (session_version > 0),
  last_login_at TIMESTAMPTZ,
  password_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS members (
  id BIGSERIAL PRIMARY KEY,
  member_id VARCHAR(16) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  password_hash TEXT NOT NULL,
  temporary_password_encrypted TEXT,
  temporary_password_created_at TIMESTAMPTZ,
  password_changed_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  failed_login_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
  locked_until TIMESTAMPTZ,
  session_version INTEGER NOT NULL DEFAULT 1 CHECK (session_version > 0),
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sessions (
  id BIGSERIAL PRIMARY KEY,
  account_type VARCHAR(16) NOT NULL CHECK (account_type IN ('administrator', 'member')),
  account_id BIGINT NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  session_version INTEGER NOT NULL CHECK (session_version > 0),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_agent VARCHAR(500),
  ip_address VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS sessions_account_idx
  ON sessions (account_type, account_id, revoked_at, expires_at);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_type VARCHAR(32),
  actor_id BIGINT,
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(32),
  target_id BIGINT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON audit_logs (actor_type, actor_id, created_at DESC);
