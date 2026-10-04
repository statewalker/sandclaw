import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Workspace meta-test: walks a hardcoded list of every @statewalker/* and
 * @statewalker/chat-mini.* package that chat-mini.app boots, verifying each one
 * has the canonical fragment-package shape.
 *
 * The hardcoded list is the forcing function (per spec D9): when a new
 * substrate package is added, the contributor must update the list, which
 * makes the new package's shape requirements visible at review time.
 *
 * Shape requirements for every package:
 *   - `package.json#exports["."]` exists.
 *   - `package.json#exports["./fragment"]` exists and resolves to a file
 *     with a default export (the init function).
 *
 * Additional requirements for renderer packages (suffix `-react`):
 *   - `package.json#exports["./styles"]` exists and points to a CSS file
 *     containing a Tailwind v4 `@source "./**\/*.{ts,tsx}"` directive.
 *
 * Package resolution: every listed package is a direct dependency of
 * chat-mini.app, so it is linked at `node_modules/<npmName>` of this app,
 * whether it is a workspace package (chat-mini.*) or comes from the
 * registry (the kernel, workbench and statewalker-ai packages). The test
 * reads each package from there, i.e. exactly what the app boots.
 */

interface PackageEntry {
  npmName: string;
  isRenderer: boolean;
}

const SUBSTRATE_REACT_PACKAGES = [
  "ui.view.react",
  "ui.view.shadcn",
  "shell.view.react",
  "settings.view.react",
  "workspace.view.react",
  "inline.view.react",
  "mime.view.image",
  "mime.view.markdown",
  "mime.view.pdf",
  "mime.view.video",
];

const SUBSTRATE_LOGIC_PACKAGES = [
  "workspace.core",
  "shell.core",
  "mime.core",
  "settings.core",
  "workspace.browser",
  "inline.core",
  "render.core",
];

const AI_LOGIC_PACKAGES = ["ai-agent-runtime.core", "ai-local-models.core"];
const AI_REACT_PACKAGES: string[] = ["ai-local-models.view.react"];

const CHAT_LOGIC_PACKAGES = ["@statewalker/chat-mini.chat"];
const CHAT_REACT_PACKAGES = ["@statewalker/chat-mini.chat-react"];

function workbenchEntries(): PackageEntry[] {
  const out: PackageEntry[] = [];
  for (const name of SUBSTRATE_LOGIC_PACKAGES) {
    out.push({
      npmName: `@statewalker/${name}`,
      isRenderer: false,
    });
  }
  for (const name of SUBSTRATE_REACT_PACKAGES) {
    out.push({
      npmName: `@statewalker/${name}`,
      isRenderer: true,
    });
  }
  return out;
}

function aiEntries(): PackageEntry[] {
  const out: PackageEntry[] = [];
  for (const name of AI_LOGIC_PACKAGES) {
    out.push({
      npmName: `@statewalker/${name}`,
      isRenderer: false,
    });
  }
  for (const name of AI_REACT_PACKAGES) {
    out.push({
      npmName: `@statewalker/${name}`,
      isRenderer: true,
    });
  }
  return out;
}

function chatEntries(): PackageEntry[] {
  const out: PackageEntry[] = [];
  for (const npmName of CHAT_LOGIC_PACKAGES) {
    out.push({
      npmName,
      isRenderer: false,
    });
  }
  for (const npmName of CHAT_REACT_PACKAGES) {
    out.push({
      npmName,
      isRenderer: true,
    });
  }
  return out;
}

const PACKAGES: PackageEntry[] = [
  ...workbenchEntries(),
  ...aiEntries(),
  ...chatEntries(),
];

// `process.cwd()` is the chat-mini.app package root when vitest runs from there;
// every package is linked under its node_modules.
function packageDir(pkg: PackageEntry): string {
  return join(process.cwd(), "node_modules", pkg.npmName);
}

function readJSON(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

describe("architecture: canonical fragment package shape", () => {
  it.each(PACKAGES)("$npmName declares . and ./fragment exports", (pkg) => {
    const pj = readJSON(join(packageDir(pkg), "package.json"));
    expect(pj.name).toBe(pkg.npmName);
    const exports = pj.exports as Record<string, string> | undefined;
    expect(
      exports,
      `${pkg.npmName}: package.json has no exports`,
    ).toBeDefined();
    expect(exports?.["."], `${pkg.npmName}: missing "." export`).toBeDefined();
    expect(
      exports?.["./fragment"],
      `${pkg.npmName}: missing "./fragment" export`,
    ).toBeDefined();
  });

  it.each(
    PACKAGES.filter((p) => p.isRenderer),
  )("$npmName declares ./styles export with @source directive", (pkg) => {
    const pjPath = join(packageDir(pkg), "package.json");
    const pj = readJSON(pjPath);
    const exports = (pj.exports ?? {}) as Record<string, string>;
    expect(
      exports["./styles"],
      `${pkg.npmName}: missing "./styles" export`,
    ).toBeDefined();
    const cssPath = join(packageDir(pkg), exports["./styles"] as string);
    const css = readFileSync(cssPath, "utf8");
    expect(
      css,
      `${pkg.npmName}: ./styles CSS does not declare @source`,
    ).toMatch(/@source\s+"/);
  });

  it.each(PACKAGES)("$npmName fragment.ts exports a default", (pkg) => {
    const pjPath = join(packageDir(pkg), "package.json");
    const pj = readJSON(pjPath);
    const exports = (pj.exports ?? {}) as Record<string, unknown>;
    // A plain path (raw-source exports) or a condition object whose "source" is the TypeScript file
    // (dist + source exports).
    const entry = exports["./fragment"];
    const fragmentRel =
      typeof entry === "string" ? entry : (entry as { source?: string } | undefined)?.source;
    if (!fragmentRel) return; // covered by the export-shape test
    const src = readFileSync(
      join(packageDir(pkg), fragmentRel),
      "utf8",
    );
    expect(
      /\bexport\s+default\b/.test(src) || /\bexport\s*\{\s*default\b/.test(src),
      `${pkg.npmName}: ${fragmentRel} has no default export`,
    ).toBe(true);
  });
});
