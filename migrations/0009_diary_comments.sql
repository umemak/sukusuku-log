-- 思い出日記へのコメント(閲覧専用ユーザーも投稿可能)
CREATE TABLE IF NOT EXISTS diary_comments (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  diary_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  comment TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (diary_id) REFERENCES diary(id),
  FOREIGN KEY (family_id) REFERENCES families(id)
);
CREATE INDEX IF NOT EXISTS idx_diary_comments_diary ON diary_comments(diary_id, created_at);
