-- 註冊時記下使用者勾選的《個人資料蒐集告知》版本與時間（2026-11-06）
ALTER TABLE users ADD COLUMN privacy_consent_at INTEGER;
ALTER TABLE users ADD COLUMN privacy_version TEXT;
