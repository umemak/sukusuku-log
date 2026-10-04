-- メンバーの役割(editor: 記録・編集 / viewer: 閲覧専用)
ALTER TABLE members ADD COLUMN role TEXT NOT NULL DEFAULT 'editor';
