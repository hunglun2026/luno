-- 遊戲雲端存檔（第一個使用者是「小虎乘法大冒險」9x9game）
-- 帳號直接沿用這裡的 users／session，不另外開一套帳號系統
-- （Steve 2026-08-23：遊戲的登入直接跟 lunquiz 同一個）。
-- game 欄位留著，之後別的遊戲也能共用同一張表。

CREATE TABLE IF NOT EXISTS game_saves (
  uid     INTEGER NOT NULL REFERENCES users(id),
  game    TEXT NOT NULL,
  slot    INTEGER NOT NULL,
  data    TEXT NOT NULL,
  updated INTEGER NOT NULL,
  PRIMARY KEY (uid, game, slot)
);
CREATE INDEX IF NOT EXISTS idx_game_saves_uid ON game_saves(uid, game);
