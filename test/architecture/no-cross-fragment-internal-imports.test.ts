import { describe, expect, it } from "vitest";

interface Violation {
  file: string;
  line: number;
  importPath: string;
  reason: string;
}

const FRAGMENTS_PREFIX = "/src/fragments/";

// Vite's import.meta.glob loads file contents at test time; query/import
// raw means we get the source text. Avoids needing @types/node.
const files = import.meta.glob("/src/fragments/**/*.{ts,tsx}", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

const IMPORT_PATTERN = /^\s*(?:import|export)[^"']*["']([^"']+)["']/gm;

function fragmentOf(path: string): string | undefined {
  if (!path.startsWith(FRAGMENTS_PREFIX)) return undefined;
  const after = path.slice(FRAGMENTS_PREFIX.length);
  const slash = after.indexOf("/");
  return slash === -1 ? after : after.slice(0, slash);
}

function resolveRelative(fromPath: string, importPath: string): string {
  // Resolve a relative import against `fromPath`, returning a normalized
  // absolute-ish path rooted at the workspace ("/src/...").
  const fromDir = fromPath.replace(/\/[^/]*$/, "");
  if (importPath.startsWith("@/")) return `/src/${importPath.slice(2)}`;
  const stack = fromDir.split("/").filter(Boolean);
  for (const seg of importPath.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") stack.pop();
    else stack.push(seg);
  }
  return `/${stack.join("/")}`;
}

function findViolations(): Violation[] {
  const violations: Violation[] = [];
  for (const [path, src] of Object.entries(files)) {
    const fileFragment = fragmentOf(path);
    if (!fileFragment) continue;

    for (const match of src.matchAll(IMPORT_PATTERN)) {
      const importPath = match[1];
      if (!importPath) continue;
      if (!importPath.startsWith(".") && !importPath.startsWith("@/")) continue;

      const resolved = resolveRelative(path, importPath);
      const targetFragment = fragmentOf(resolved);
      if (!targetFragment) continue;
      if (targetFragment === fileFragment) continue;

      const relInTarget = resolved.slice(
        FRAGMENTS_PREFIX.length + targetFragment.length + 1,
      );
      if (relInTarget.startsWith("internal/")) {
        const lineNumber = src.slice(0, match.index ?? 0).split("\n").length;
        violations.push({
          file: path,
          line: lineNumber,
          importPath,
          reason: `crosses into "${targetFragment}/internal/" — must go through index.js or public/`,
        });
      }
    }
  }
  return violations;
}

describe("architecture: cross-fragment internal/ imports are forbidden", () => {
  it("no fragment imports another fragment's internal/* directly", () => {
    const violations = findViolations();
    if (violations.length > 0) {
      const formatted = violations
        .map(
          (v) =>
            `  ${v.file}:${v.line}\n    import "${v.importPath}"\n    ${v.reason}`,
        )
        .join("\n");
      throw new Error(
        `Cross-fragment internal/ import violations:\n${formatted}\n\n` +
          `Fix: import from "<other-fragment>/index.js" (the fragment's public surface) instead.`,
      );
    }
    expect(violations).toEqual([]);
  });
});
