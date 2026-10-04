import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The @statewalker view packages ship dist JavaScript that imports CSS (dockview's
    // stylesheet). Node cannot load .css, so let Vite process them as it does in the app.
    server: { deps: { inline: [/@statewalker\//] } },
  },
});
