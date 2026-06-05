import { join, resolve } from "node:path";

/**
 * Root of the umbrella `data/` directory — the folder that holds the project
 * (wiki) directories. This app lives at `workspaces/statewalker-apps/apps/
 * wiki-viewer.app`, so the umbrella `data/` is four levels up by default.
 * Set REPORT_DATA_ROOT to point at any other data root (recommended in
 * deployment).
 */
export function dataRoot(): string {
  const env = process.env.REPORT_DATA_ROOT;
  return env
    ? resolve(env)
    : resolve(process.cwd(), "..", "..", "..", "..", "data");
}

/** `<dataRoot>/<project>/reports` — where a project's report sets live. */
export function projectReportsDir(project: string): string {
  return join(dataRoot(), project, "reports");
}

/** `<dataRoot>/<project>/answers` — where saved live-search answers are filed. */
export function projectAnswersDir(project: string): string {
  return join(dataRoot(), project, "answers");
}

/** `<dataRoot>/<project>/.wikiindex/pages` (the project is its own wiki). */
export function wikiPagesDir(project: string): string {
  return join(dataRoot(), project, ".wikiindex", "pages");
}

/** `<dataRoot>/<project>/sources` — where the original PDFs live. */
export function wikiSourcesDir(project: string): string {
  return join(dataRoot(), project, "sources");
}

/** `<dataRoot>/<project>` — the vault root passed to the wiki runtime. */
export function projectRoot(project: string): string {
  return join(dataRoot(), project);
}
