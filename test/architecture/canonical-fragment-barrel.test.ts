import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Workspace meta-test: walks a hardcoded list of every @statewalker/* and
 * @repo/chat-mini.* package that chat-mini.app boots, verifying each one
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
 * Workspace path resolution: `import.meta.url` is the test file inside
 * `chat-mini.app/test/architecture/`. From there each package lives at
 * `../../../../../<package-dir>/` for `@repo/chat-mini.*` packages or
 * `../../../../../../statewalker-workbench/packages/<x>/` etc. The map
 * below names each one explicitly.
 */

interface PackageEntry {
  npmName: string;
  // Path relative to the umbrella root, e.g. "workspaces/statewalker-workbench/packages/core-react".
  rootRelPath: string;
  isRenderer: boolean;
}

const SUBSTRATE_REACT_PACKAGES = [
  "core-react",
  "shadcn-react",
  "dock-react",
  "settings.view.react",
  "workspace-bridge-react",
  "inline.view.react",
  "catalog-registry-react",
  "mime.view.image",
  "mime.view.markdown",
  "mime.view.pdf",
  "mime.view.video",
];

const SUBSTRATE_LOGIC_PACKAGES = [
  "workspace",
  "dock",
  "mime.core",
  "settings.core",
  "workspace-bridge",
  "inline.core",
  "render.core",
];

const AI_LOGIC_PACKAGES = ["ai-agent-runtime", "ai-providers"];
const AI_REACT_PACKAGES: string[] = [];

const CHAT_LOGIC_PACKAGES = [
  { npmName: "@repo/chat-mini.chat", dir: "chat-mini.chat" },
];
const CHAT_REACT_PACKAGES = [
  { npmName: "@repo/chat-mini.chat-react", dir: "chat-mini.chat-react" },
];

function workbenchEntries(): PackageEntry[] {
  const out: PackageEntry[] = [];
  for (const name of SUBSTRATE_LOGIC_PACKAGES) {
    out.push({
      npmName: `@statewalker/${name}`,
      rootRelPath: `workspaces/statewalker-workbench/packages/${name}`,
      isRenderer: false,
    });
  }
  for (const name of SUBSTRATE_REACT_PACKAGES) {
    out.push({
      npmName: `@statewalker/${name}`,
      rootRelPath: `workspaces/statewalker-workbench/packages/${name}`,
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
      rootRelPath: `workspaces/statewalker-ai/packages/${name}`,
      isRenderer: false,
    });
  }
  for (const name of AI_REACT_PACKAGES) {
    out.push({
      npmName: `@statewalker/${name}`,
      rootRelPath: `workspaces/statewalker-ai/packages/${name}`,
      isRenderer: true,
    });
  }
  return out;
}

function chatEntries(): PackageEntry[] {
  const out: PackageEntry[] = [];
  for (const { npmName, dir } of CHAT_LOGIC_PACKAGES) {
    out.push({
      npmName,
      rootRelPath: `workspaces/statewalker-apps/apps/${dir}`,
      isRenderer: false,
    });
  }
  for (const { npmName, dir } of CHAT_REACT_PACKAGES) {
    out.push({
      npmName,
      rootRelPath: `workspaces/statewalker-apps/apps/${dir}`,
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

// chat-mini.app/test/architecture/<this>.test.ts → umbrella root. `process.cwd()`
// is the chat-mini.app package root when vitest runs from there.
const UMBRELLA_ROOT = join(process.cwd(), "..", "..", "..", "..");

function readJSON(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

describe("architecture: canonical fragment package shape", () => {
  it.each(PACKAGES)("$npmName declares . and ./fragment exports", (pkg) => {
    const pj = readJSON(join(UMBRELLA_ROOT, pkg.rootRelPath, "package.json"));
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
    const pjPath = join(UMBRELLA_ROOT, pkg.rootRelPath, "package.json");
    const pj = readJSON(pjPath);
    const exports = (pj.exports ?? {}) as Record<string, string>;
    expect(
      exports["./styles"],
      `${pkg.npmName}: missing "./styles" export`,
    ).toBeDefined();
    const cssPath = join(
      UMBRELLA_ROOT,
      pkg.rootRelPath,
      exports["./styles"] as string,
    );
    const css = readFileSync(cssPath, "utf8");
    expect(
      css,
      `${pkg.npmName}: ./styles CSS does not declare @source`,
    ).toMatch(/@source\s+"/);
  });

  it.each(PACKAGES)("$npmName fragment.ts exports a default", (pkg) => {
    const pjPath = join(UMBRELLA_ROOT, pkg.rootRelPath, "package.json");
    const pj = readJSON(pjPath);
    const exports = (pj.exports ?? {}) as Record<string, string>;
    const fragmentRel = exports["./fragment"];
    if (!fragmentRel) return; // covered by the export-shape test
    const src = readFileSync(
      join(UMBRELLA_ROOT, pkg.rootRelPath, fragmentRel),
      "utf8",
    );
    expect(
      /\bexport\s+default\b/.test(src) || /\bexport\s*\{\s*default\b/.test(src),
      `${pkg.npmName}: ${fragmentRel} has no default export`,
    ).toBe(true);
  });
});
