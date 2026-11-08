/**
 * The built help site: what httpeers' sites host and PeerShare need from it.
 * Builds once (astro build) into dist/.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const dist = join(root, "dist");
const read = (path: string) => readFileSync(join(dist, path), "utf8");
const PAGES = [
  "index.html",
  "getting-started.html",
  "how-it-works.html",
  "security.html",
  "local-proxy.html",
  "troubleshooting.html",
  "404.html",
];

beforeAll(() => {
  execFileSync("pnpm", ["exec", "astro", "build"], { cwd: root, stdio: "ignore" });
}, 120_000);

describe("the help site", () => {
  it("writes every page as a .html file, which the sites host serves at /<name>", () => {
    for (const page of PAGES) expect(existsSync(join(dist, page)), page).toBe(true);
  });

  it("lets the published PeerShare page read it (cors), with the 404 page", () => {
    const config = JSON.parse(read(".site/config.json"));
    expect(config.cors).toContain("https://peershare.httpeers.net");
    expect(config.notFound).toBe("/404.html");
  });

  it("links within itself by path only, so a Guest's isolated copy stays on its own origin", () => {
    for (const page of PAGES) {
      expect(read(page)).not.toContain("https://peershare-demo.httpeers.net/");
    }
  });

  it("explains why sharing is safe: Noise, peer IDs as keys, tab to tab, isolated origins", () => {
    // The page's text, as read: tags out, whitespace collapsed (the HTML keeps source line breaks).
    const security = read("security.html").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    for (const words of ["Noise", "public key", "browser tab", "own origin", "single-use"]) {
      expect(security).toContain(words);
    }
  });
});
