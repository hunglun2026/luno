// 把前端的 public/js/qtypes.js 複製成 src/qtypes.js 並加上 export（判分邏輯只維護一份）。
// 改了 public/js/qtypes.js 之後執行：node sync-qtypes.mjs；test/sharegrade.test.js 會檢查兩邊一致。
import { readFileSync, writeFileSync } from "node:fs";
const src = readFileSync(new URL("../public/js/qtypes.js", import.meta.url), "utf8");
const footer = "\n// ===== 以下由 sync-qtypes.mjs 加上，不屬於前端檔案 =====\nexport { qKind, qtIsTyped, qtShuffle, qtGrade, qtParseMatch, qtParseOrder };\n";
writeFileSync(new URL("./src/qtypes.js", import.meta.url), src + footer);
console.log("已同步 src/qtypes.js");
