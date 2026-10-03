-- AI機能(音声/文章入力)の利用回数。家族×日(日本時間)ごとに集計して使いすぎを防ぐ
CREATE TABLE IF NOT EXISTS ai_usage (
  family_id TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (family_id, day)
);
