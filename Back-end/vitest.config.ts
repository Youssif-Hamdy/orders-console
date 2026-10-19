import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
    setupFiles: [],
    // Run test files sequentially so the pagination-completeness test
    // is not disturbed by concurrent inserts from other test files.
    fileParallelism: false,
  },
});
