-- 思い出日記の複数枚写真対応 (1つの日記に最大10枚の写真を紐づけ)
CREATE TABLE IF NOT EXISTS diary_photos (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  diary_id TEXT NOT NULL,
  photo_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (child_id) REFERENCES children(id),
  FOREIGN KEY (diary_id) REFERENCES diary(id),
  FOREIGN KEY (family_id) REFERENCES families(id)
);
CREATE INDEX IF NOT EXISTS idx_diary_photos_child ON diary_photos(child_id, created_at);
CREATE INDEX IF NOT EXISTS idx_diary_photos_diary ON diary_photos(diary_id, sort_order);

-- 既存の diary.photo_id を diary_photos に移行
INSERT INTO diary_photos (id, family_id, child_id, diary_id, photo_id, sort_order, created_at)
SELECT
  id || '-p0',
  family_id,
  child_id,
  id,
  photo_id,
  0,
  created_at
FROM diary
WHERE photo_id IS NOT NULL AND photo_id != '';
