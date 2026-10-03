-- 離乳食・アレルギー記録(1回の試食ごとに1行)
CREATE TABLE IF NOT EXISTS foods (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  member_id TEXT,
  food TEXT NOT NULL,
  tried_on TEXT NOT NULL,            -- YYYY-MM-DD
  reaction TEXT NOT NULL DEFAULT 'ok', -- ok / mild / severe
  note TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (child_id) REFERENCES children(id)
);
CREATE INDEX IF NOT EXISTS idx_foods_child ON foods(child_id, tried_on);

-- 思い出日記(写真は R2 に保存し、photo_id で参照)
CREATE TABLE IF NOT EXISTS diary (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  member_id TEXT,
  entry_date TEXT NOT NULL,          -- YYYY-MM-DD
  body TEXT,
  photo_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (child_id) REFERENCES children(id)
);
CREATE INDEX IF NOT EXISTS idx_diary_child ON diary(child_id, entry_date);
