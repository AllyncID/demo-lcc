ALTER TABLE creators ADD COLUMN registration_number TEXT;
UPDATE creators SET registration_number='LCC-' || printf('%06d',id) WHERE registration_number IS NULL;
CREATE UNIQUE INDEX creators_registration_number_idx ON creators(registration_number);
CREATE TABLE participant_otps (
  email TEXT PRIMARY KEY COLLATE NOCASE, code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE participant_sessions (
  token_hash TEXT PRIMARY KEY, creator_id INTEGER NOT NULL REFERENCES creators(id), expires_at INTEGER NOT NULL
);
CREATE INDEX participant_sessions_expiry_idx ON participant_sessions(expires_at);
CREATE TABLE participant_limits (
  key TEXT PRIMARY KEY, count INTEGER NOT NULL, started_at INTEGER NOT NULL, last_at INTEGER NOT NULL
);
CREATE TABLE tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT, creator_id INTEGER NOT NULL UNIQUE REFERENCES creators(id),
  token TEXT NOT NULL UNIQUE, number TEXT NOT NULL UNIQUE, issued_at TEXT NOT NULL,
  checked_in_at TEXT, checked_in_by INTEGER REFERENCES admins(id)
);
CREATE TABLE mail_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT, dedupe_key TEXT NOT NULL UNIQUE,
  recipient TEXT NOT NULL, subject TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL,
  sent_at TEXT
);
