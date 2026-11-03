-- 題庫：AI 出過的選擇題（單選、複選、是非、克漏字）依年級、科目、版本、範圍分類存起來，之後同條件直接抽，不必每次叫 AI。
--
-- 設計取捨（2026-11-03，詳見 進度/進度.md「題庫」）：
--   * 只收有選項的題：填充、簡答、計算題答案不唯一，無法自動驗證
--   * 只收「純靠年級科目範圍出的題」，老師上傳課本或講義出的題不入庫（版權）
--   * 新題先 pending，由後端另叫一次 AI 獨立作答比對，一致才 approved；不一致或不適合記 suspect
--   * 之後上線的「答對率過低」「多人回報有誤」也會把題目轉成 suspect，不會被抽出
-- 不用 R2：純文字題，D1 就夠（一題約 1～2KB）。

CREATE TABLE IF NOT EXISTS bank_questions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  hash            TEXT    NOT NULL UNIQUE,         -- 題幹＋選項正規化後的 SHA-256，去重用
  grade           TEXT    NOT NULL,
  subject         TEXT    NOT NULL,
  publisher       TEXT    NOT NULL DEFAULT '',
  scope           TEXT    NOT NULL DEFAULT '',     -- 使用者填的原文
  scope_key       TEXT    NOT NULL DEFAULT '',     -- 嚴格正規化後（NFKC、去空白、小寫），比對用
  qkind           TEXT    NOT NULL CHECK(qkind IN ('single','multi','tf','cloze')),
  difficulty      TEXT    NOT NULL DEFAULT '',
  lang            TEXT    NOT NULL DEFAULT '',
  q               TEXT    NOT NULL,
  options_json    TEXT    NOT NULL,                -- ["選項1","選項2",...]
  answer          TEXT    NOT NULL,                -- 正確選項字母，複選已排序合併，例如 "B"、"AC"
  explanation     TEXT    NOT NULL DEFAULT '',
  status          TEXT    NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','suspect','removed')),
  verify_note     TEXT    NOT NULL DEFAULT '',
  verify_tries    INTEGER NOT NULL DEFAULT 0,      -- 驗證失敗重試次數（cron 重試上限用）
  answered_count  INTEGER NOT NULL DEFAULT 0,
  correct_count   INTEGER NOT NULL DEFAULT 0,
  report_count    INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bank_lookup ON bank_questions(status, grade, subject, scope_key, qkind);
CREATE INDEX IF NOT EXISTS idx_bank_pending ON bank_questions(status, verify_tries, created_at);

-- 「回報有誤」：同一個裝置對同一題只算一次
CREATE TABLE IF NOT EXISTS bank_reports (
  question_id  INTEGER NOT NULL REFERENCES bank_questions(id),
  client_id    TEXT    NOT NULL,
  reason       TEXT    NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (question_id, client_id)
);
