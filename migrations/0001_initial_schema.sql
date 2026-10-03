-- 家族(共有の単位)
CREATE TABLE IF NOT EXISTS families (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL
);

-- 家族メンバー(端末ごとのトークンのハッシュで認証)
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  name TEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (family_id) REFERENCES families(id)
);
CREATE INDEX IF NOT EXISTS idx_members_family ON members(family_id);

-- 子ども
CREATE TABLE IF NOT EXISTS children (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  name TEXT NOT NULL,
  birthday TEXT NOT NULL,           -- YYYY-MM-DD
  gender TEXT NOT NULL DEFAULT 'unknown', -- boy / girl / unknown
  created_at INTEGER NOT NULL,
  FOREIGN KEY (family_id) REFERENCES families(id)
);
CREATE INDEX IF NOT EXISTS idx_children_family ON children(family_id);

-- 育児ログ(授乳・睡眠・排泄・体温など)
CREATE TABLE IF NOT EXISTS logs (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  member_id TEXT,
  type TEXT NOT NULL,               -- breast / formula / expressed / sleep / pee / poop / temp / bath / med / memo
  started_at INTEGER NOT NULL,      -- epoch ms
  ended_at INTEGER,                 -- epoch ms (計測中はNULL)
  amount REAL,                      -- ml / 体温 など
  detail TEXT,                      -- JSON(左右、うんちの状態、薬の名前など)
  note TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (child_id) REFERENCES children(id)
);
CREATE INDEX IF NOT EXISTS idx_logs_child_started ON logs(child_id, started_at);
CREATE INDEX IF NOT EXISTS idx_logs_child_type ON logs(child_id, type, started_at);

-- 成長記録
CREATE TABLE IF NOT EXISTS growth (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  measured_on TEXT NOT NULL,        -- YYYY-MM-DD
  weight_g INTEGER,
  height_cm REAL,
  head_cm REAL,
  note TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (child_id) REFERENCES children(id)
);
CREATE INDEX IF NOT EXISTS idx_growth_child ON growth(child_id, measured_on);

-- 予防接種の接種済み記録
CREATE TABLE IF NOT EXISTS vaccinations (
  child_id TEXT NOT NULL,
  family_id TEXT NOT NULL,
  vaccine_key TEXT NOT NULL,
  done_on TEXT NOT NULL,            -- YYYY-MM-DD
  PRIMARY KEY (child_id, vaccine_key),
  FOREIGN KEY (child_id) REFERENCES children(id)
);
