import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // `ai-config.core` comes from npm and imports `workspace.core`, which is linked from this
    // workspace. Inline both so they share one module instance (one `Secrets` adapter token).
    server: { deps: { inline: [/@statewalker\//] } },
  },
});
