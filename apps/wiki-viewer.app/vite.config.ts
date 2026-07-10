import { fileURLToPath } from "node:url";
import build from "@hono/vite-build/node";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import honox from "honox/vite";
import { defineConfig, type Plugin } from "vite";

const appDir = fileURLToPath(new URL("./app", import.meta.url));

/**
 * HonoX's Vite plugin forces `ssr.noExternal: true` (inline every dependency
 * into the SSR graph). That breaks the runtime's CJS npm deps (`yaml`, and the
 * React-UI tree's `use-sync-external-store` shim, …) which assume a CJS
 * (`require`/`module`) scope Vite's ESM SSR runner doesn't provide.
 *
 * We run after HonoX and flip the policy to the only one that works here:
 * inline just the workspace packages that ship raw `.ts` (so Vite transpiles
 * their NodeNext `.js` specifiers, as vitest does), and externalise everything
 * in node_modules so Node loads their real (CJS-capable) builds natively.
 */
function ssrExternalPolicy(): Plugin {
  return {
    name: "wiki-viewer:ssr-external-policy",
    enforce: "post",
    // Mutate the *resolved* config so this wins over HonoX's `noExternal: true`
    // regardless of plugin/merge ordering. Vite 6 reads the SSR policy from the
    // environment API (`environments.ssr.resolve`), so set both shapes.
    configResolved(resolved) {
      // Inline only what needs Vite's transform: HonoX (its route loader uses
      // `import.meta.glob`) and the workspace packages that ship raw `.ts`.
      // Everything else in node_modules stays external → loaded natively, so
      // CJS deps (yaml, use-sync-external-store, …) keep their require/module.
      const noExternal = [/^honox/, /^@statewalker\//];
      const external = ["react", "react-dom"];
      // biome-ignore lint/suspicious/noExplicitAny: ssr config is readonly in types only
      const ssr = resolved.ssr as any;
      ssr.noExternal = noExternal;
      ssr.external = external;
      // biome-ignore lint/suspicious/noExplicitAny: environment API is loosely typed here
      const envResolve = (resolved as any).environments?.ssr?.resolve;
      if (envResolve) {
        envResolve.noExternal = noExternal;
        envResolve.external = external;
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  if (mode === "client") {
    return {
      resolve: { alias: { "@": appDir } },
      plugins: [react(), tailwindcss()],
      build: {
        rollupOptions: {
          input: ["./app/client.ts", "./app/style.css"],
          output: {
            entryFileNames: "static/client.js",
            chunkFileNames: "static/assets/[name]-[hash].js",
            assetFileNames: "static/assets/[name].[ext]",
          },
        },
        emptyOutDir: false,
      },
    };
  }
  return {
    resolve: { alias: { "@": appDir } },
    plugins: [honox(), react(), tailwindcss(), ssrExternalPolicy(), build()],
  };
});
