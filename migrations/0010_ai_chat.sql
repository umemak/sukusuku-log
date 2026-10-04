-- AIアシスタントとの対話履歴。メンバー本人だけが読める(家族内でも共有しない)。
-- 端末が変わっても引き継げるようD1に保存し、メンバーごとに直近50件だけ残す。
CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  role TEXT NOT NULL,                 -- user / model
  content TEXT NOT NULL,
  is_letter INTEGER NOT NULL DEFAULT 0, -- 1: 成長レター(思い出日記に保存できる)
  created_at INTEGER NOT NULL,
  FOREIGN KEY (family_id) REFERENCES families(id)
);
CREATE INDEX IF NOT EXISTS idx_ai_chat_member ON ai_chat_messages(member_id, created_at);
