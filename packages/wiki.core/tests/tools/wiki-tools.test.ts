import type { Workspace } from "@statewalker/workspace.core";
import { beforeEach, describe, expect, it } from "vitest";
import { createWikiTools } from "../../src/index.js";
import { buildMultiWikiWorkspace } from "../util/multi-wiki-fixture.js";

// biome-ignore lint/suspicious/noExplicitAny: minimal tool-call options for the test
const execOpts = { toolCallId: "t", messages: [] } as any;

describe("createWikiTools", () => {
  let workspace: Workspace;

  beforeEach(async () => {
    workspace = await buildMultiWikiWorkspace();
  });

  it("exposes wiki_search and wiki_ask", () => {
    const tools = createWikiTools(workspace);
    expect(Object.keys(tools).sort()).toEqual(["wiki_ask", "wiki_search"]);
  });

  it("wiki_search aggregates project-qualified results across wikis", async () => {
    const tools = createWikiTools(workspace);
    const res = await tools.wiki_search?.execute?.({ query: "Acme founders" }, execOpts);
    expect(res.availableWikis.sort()).toEqual(["a", "b"]);
    const wikisHit = new Set(res.matches.map((m: { uri: string }) => m.uri.split("/")[0]));
    expect(wikisHit.has("a")).toBe(true);
    expect(wikisHit.has("b")).toBe(true);
    for (const m of res.matches) expect(m.uri).toMatch(/^(a|b)\//);
  });

  it("wiki_search scopes both wikis with a `*/docs/*` mask", async () => {
    const tools = createWikiTools(workspace);
    const res = await tools.wiki_search?.execute?.(
      { query: "Acme founders", paths: ["*/docs/*"] },
      execOpts,
    );
    const uris = res.matches.map((m: { uri: string }) => m.uri);
    expect(uris.length).toBeGreaterThan(0);
    for (const u of uris) expect(u).toMatch(/^(a|b)\/docs\//);
    expect(uris.some((u: string) => u.includes("/notes/"))).toBe(false);
  });

  it("wiki_ask returns per-project tagged answers (default = all wikis)", async () => {
    const tools = createWikiTools(workspace);
    const res = await tools.wiki_ask?.execute?.({ question: "Who founded Acme?" }, execOpts);
    const byProject = new Map(res.answers.map((a: { project: string }) => [a.project, a]));
    expect([...byProject.keys()].sort()).toEqual(["a", "b"]);
    for (const a of res.answers) expect(a.evidenceCount).toBeGreaterThan(0);
  });

  it("wiki_ask scopes retrieval per wiki with a `*/docs/*` mask", async () => {
    const tools = createWikiTools(workspace);
    const res = await tools.wiki_ask?.execute?.(
      { question: "Who founded Acme?", paths: ["*/docs/*"] },
      execOpts,
    );
    expect(res.answers.length).toBe(2);
    for (const a of res.answers) {
      expect(a.evidenceCount).toBeGreaterThan(0);
      for (const c of a.citations) expect(c.startsWith("/docs/")).toBe(true);
    }
  });
});
