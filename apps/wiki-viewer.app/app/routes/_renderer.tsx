import { reactRenderer } from "@hono/react-renderer";

declare module "@hono/react-renderer" {
  interface Props {
    title?: string;
  }
}

export default reactRenderer(({ children, title }) => {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="icon" href="/favicon.ico" />
        {import.meta.env.PROD ? (
          <>
            <script type="module" src="/static/client.js" />
            <link rel="stylesheet" href="/static/assets/style.css" />
          </>
        ) : (
          <>
            {/*
             * @vitejs/plugin-react's Fast Refresh runtime expects a preamble in
             * the page. HonoX serves no index.html for the plugin to transform,
             * so we inject it ourselves (dev only) BEFORE the client entry —
             * otherwise islands throw "can't detect preamble" and never hydrate.
             */}
            <script
              type="module"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: static dev-only Vite preamble
              dangerouslySetInnerHTML={{
                __html: [
                  'import RefreshRuntime from "/@react-refresh"',
                  "RefreshRuntime.injectIntoGlobalHook(window)",
                  "window.$RefreshReg$ = () => {}",
                  "window.$RefreshSig$ = () => (type) => type",
                  "window.__vite_plugin_react_preamble_installed__ = true",
                ].join("\n"),
              }}
            />
            <script type="module" src="/app/client.ts" />
            <link rel="stylesheet" href="/app/style.css" />
          </>
        )}
        <title>{title ?? "Wiki Viewer"}</title>
      </head>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
});
