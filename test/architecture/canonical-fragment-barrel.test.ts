import { describe, expect, it } from "vitest";

/**
 * Every fragment under `src/fragments/<name>/` must follow this
 * canonical shape so that fragments are uniformly composable and
 * the barrel cannot leak `internal/` modules:
 *
 *   - `index.ts` (the barrel) is exactly the two-line canonical
 *     form — re-export `public/index.js` + the default from
 *     `public/init.js`. Nothing else.
 *
 *   - `public/init.ts` (or `init.tsx`) exists and exports the
 *     fragment's init function as default.
 *
 *   - `public/index.ts` exists. It MAY be empty (`export {};`)
 *     for fragments whose only public artifact is the init
 *     function (e.g. a renderer fragment that only registers
 *     React components into shared registries).
 *
 *   - The barrel file does NOT mention `./internal/` anywhere.
 *
 * Vite's `import.meta.glob` loads file contents at test time, so
 * this test runs without filesystem APIs.
 */

const barrels = import.meta.glob("/src/fragments/*/index.ts", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

const publicIndexes = import.meta.glob("/src/fragments/*/public/index.ts", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

const initFiles = import.meta.glob("/src/fragments/*/public/init.{ts,tsx}", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

const CANONICAL_BARREL = `export * from "./public/index.js";
export { default } from "./public/init.js";
`;

function fragmentName(barrelPath: string): string {
  // "/src/fragments/<name>/index.ts" -> "<name>"
  const m = barrelPath.match(/\/src\/fragments\/([^/]+)\/index\.ts$/);
  if (!m?.[1]) throw new Error(`unexpected barrel path: ${barrelPath}`);
  return m[1];
}

describe("architecture: canonical fragment shape", () => {
  it("every fragment barrel is exactly the canonical two-line form", () => {
    const violations: string[] = [];
    for (const [path, src] of Object.entries(barrels)) {
      if (src !== CANONICAL_BARREL) {
        violations.push(
          `${path}\n  expected:\n${CANONICAL_BARREL}  got:\n${src}`,
        );
      }
    }
    if (violations.length > 0) {
      throw new Error(
        `Barrel deviation:\n${violations.join("\n---\n")}\n\n` +
          `Each fragment's index.ts must be exactly:\n${CANONICAL_BARREL}`,
      );
    }
  });

  it("every fragment has public/index.ts and public/init.{ts,tsx}", () => {
    const missing: string[] = [];
    for (const path of Object.keys(barrels)) {
      const name = fragmentName(path);
      const publicIndex = `/src/fragments/${name}/public/index.ts`;
      const initTs = `/src/fragments/${name}/public/init.ts`;
      const initTsx = `/src/fragments/${name}/public/init.tsx`;
      if (!(publicIndex in publicIndexes)) {
        missing.push(`${name}: missing ${publicIndex}`);
      }
      if (!(initTs in initFiles) && !(initTsx in initFiles)) {
        missing.push(`${name}: missing public/init.ts or public/init.tsx`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("every public/init.{ts,tsx} has a default export", () => {
    const violations: string[] = [];
    for (const [path, src] of Object.entries(initFiles)) {
      if (!/\bexport\s+default\b/.test(src)) {
        violations.push(`${path}: no \`export default\` found`);
      }
    }
    expect(violations).toEqual([]);
  });
});
