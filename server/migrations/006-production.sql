INSERT OR IGNORE INTO categories(name) VALUES('Olahraga');
CREATE TABLE IF NOT EXISTS request_limits (
  key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS request_limits_expiry_idx ON request_limits(expires_at);
CREATE INDEX IF NOT EXISTS participant_limits_expiry_idx ON participant_limits(started_at);
CREATE INDEX IF NOT EXISTS votes_created_at_idx ON votes(created_at);
CREATE TRIGGER IF NOT EXISTS creator_category_guard BEFORE UPDATE OF category_id ON creators
WHEN NEW.category_id != OLD.category_id AND EXISTS(SELECT 1 FROM votes WHERE creator_id=OLD.id)
BEGIN SELECT RAISE(ABORT, 'creator_category_has_votes'); END;
CREATE TRIGGER IF NOT EXISTS vote_creator_guard BEFORE INSERT ON votes
WHEN NOT EXISTS(SELECT 1 FROM creators c JOIN categories cat ON cat.id=c.category_id
  WHERE c.id=NEW.creator_id AND c.category_id=NEW.category_id AND c.status='approved' AND c.visible=1 AND cat.active=1)
BEGIN SELECT RAISE(ABORT, 'creator_unavailable'); END;
