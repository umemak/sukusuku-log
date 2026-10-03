-- 1人のメンバーが複数の端末(スマホ・PCなど)を使えるように、追加端末用の鍵を別テーブルで持つ
CREATE TABLE IF NOT EXISTS member_tokens (
  token_hash TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_member_tokens_member ON member_tokens(member_id);
