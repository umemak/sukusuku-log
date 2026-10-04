-- 有効期限つきワンタイム招待コード
CREATE TABLE IF NOT EXISTS invitations (
  code TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  created_by_member_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  used_by_member_id TEXT,
  FOREIGN KEY (family_id) REFERENCES families(id)
);
CREATE INDEX IF NOT EXISTS idx_invitations_family ON invitations(family_id, created_at);
CREATE INDEX IF NOT EXISTS idx_invitations_active ON invitations(family_id, used_at, expires_at);
