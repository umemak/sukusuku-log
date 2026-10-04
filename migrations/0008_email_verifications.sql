-- 新規家族作成時のメール認証
CREATE TABLE IF NOT EXISTS email_verifications (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  verified_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_email_verifications_email ON email_verifications(email, created_at);

-- 家族作成者のメールアドレス列を追加
ALTER TABLE families ADD COLUMN creator_email TEXT;
