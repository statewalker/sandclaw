import { resolve } from "node:path";

/**
 * Root of the umbrella `data/` directory — the folder that holds the project
 * (wiki) directories. This app lives at `workspaces/statewalker-apps/apps/
 * wiki-viewer.app`, so the umbrella `data/` is four levels up by default.
 * Set REPORT_DATA_ROOT to point at any other data root (recommended in
 * deployment). It is the `rootDir` of the server's `NodeFilesApi`.
 */
export function dataRoot(): string {
  const env = process.env.REPORT_DATA_ROOT;
  return env
    ? resolve(env)
    : resolve(process.cwd(), "..", "..", "..", "..", "data");
}
