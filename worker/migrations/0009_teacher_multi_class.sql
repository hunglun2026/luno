-- 一個老師可以有多個班級（2026-11-11）。
-- 原本班級名稱全站唯一（學生輸入名稱加入用）；多班之後不同老師常有同名的「三年1班」，
-- 改成「同一個老師底下不重名」，學生加入一律以班級代碼（join_code，全站唯一）為準。
-- 舊的「輸入班級名稱加入」仍可用，但只有名稱剛好對到一個班時才算數（見 classcode.js findClassByCodeOrName）。
DROP INDEX IF EXISTS idx_classes_name_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_classes_teacher_name ON classes(teacher_id, name);
