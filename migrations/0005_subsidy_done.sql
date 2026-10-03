-- 補助・手続きの「申請済み」チェック(お子さんごと・家族で共有)
CREATE TABLE IF NOT EXISTS subsidy_done (
  child_id TEXT NOT NULL,
  family_id TEXT NOT NULL,
  item_key TEXT NOT NULL,
  done_on TEXT NOT NULL,            -- YYYY-MM-DD(チェックした日)
  member_id TEXT,
  PRIMARY KEY (child_id, item_key),
  FOREIGN KEY (child_id) REFERENCES children(id)
);
