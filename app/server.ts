// Vite/HonoX only expose VITE_-prefixed vars to `import.meta.env`; they do NOT
// populate `process.env` for SSR. The query runtime reads provider keys
// (OPENAI_API_KEY, …) from `process.env`, so load the app's `.env` here, before
// any route module. dotenv reads from the process cwd — the app dir under
// `pnpm dev` / `pnpm start` — and existing env vars win, so shell-exported
// values still override the file.
import "dotenv/config";
import { createApp } from "honox/server";

const app = createApp();

export default app;
