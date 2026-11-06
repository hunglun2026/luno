// 刻度 Worker 的自動化測試設定。跑法：npm test（只測試）、npm run coverage（測試＋覆蓋率報告到 coverage/）。
// 覆蓋率只量 src/；check-bug 第 6 項讀 coverage/coverage-summary.json。
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.js"],
    environment: "node",
    testTimeout: 20000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.js"],
      reporter: ["text-summary", "json-summary", "lcov"],
      reportsDirectory: "coverage",
    },
  },
});
