-- 班級加入代碼：給學生註冊／加入班級用的 6 碼（之前是拿班級名稱當代碼，畫面上看起來像「六年己班」而不是代碼）。
-- 欄位允許 NULL：舊班級不在這裡硬補，由 worker 第一次被讀到時自動補一組（classcode.js ensureClassCode），
-- 這樣代碼字元表跟新班級一致，也不用在 SQL 裡生亂數。UNIQUE 索引允許多個 NULL。
-- 舊的「輸入班級名稱加入」仍然有效（classcode.js findClassByCodeOrName 先比代碼、比不到再比名稱），已註冊的學生與已發出去的說明不會失效。
ALTER TABLE classes ADD COLUMN join_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_classes_join_code ON classes(join_code);
