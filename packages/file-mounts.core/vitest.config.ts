import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { conditions: ["source", "import", "module", "default"] },
  test: { include: ["tests/**/*.test.ts"], exclude: ["tests/**/*.integration.test.ts"] },
});
