import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 3460,
    host: true,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
    conditions: ["source", "browser", "import", "module", "default"],
  },
  define: {
    "process.env": {},
  },
  plugins: [react(), tailwindcss()],
});
