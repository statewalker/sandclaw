import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "jsdom",
		// The @statewalker view packages ship dist JavaScript that imports CSS (dockview's
		// stylesheet). Node cannot load .css, so let Vite process them as it does in the app.
		server: { deps: { inline: [/@statewalker\//] } },
		include: [
			"src/**/*.test.ts",
			"src/**/*.test.tsx",
			"tests/**/*.test.ts",
			"tests/**/*.test.tsx",
		],
	},
});
