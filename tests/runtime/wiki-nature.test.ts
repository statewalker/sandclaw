import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { Workspace } from "@statewalker/workspace.core";
import { describe, expect, it } from "vitest";
import {
  type LlmApi,
  registerWiki,
  type WikiConfigData,
  WikiEmbeddingFrozenError,
  wikiNatureOf,
} from "../../src/index.js";
import { makeStubLlm } from "../util/stub-llm.js";

// The wiki nature tests never run a generation stage; a throwing stub suffices.
const noopGenerate = (async () => ({
  output: {},
  usage: { inputTokens: 0, outputTokens: 0 },
})) as LlmApi["generateObject"];

const CONFIG: WikiConfigData = {
  models: { default: "openai:gpt-4.1-mini" },
  embedModel: "openai:text-embedding-3-small",
  dimensionality: 8,
};

function setup(initialFiles: Record<string, string> = {}) {
  const filesApi = new MemFilesApi({ initialFiles });
  const workspace = new Workspace().setFileSystem(filesApi);
  registerWiki(workspace, { llm: makeStubLlm({ generateObject: noopGenerate }) });
  return workspace;
}

async function project(workspace: Workspace) {
  const p = await workspace.getProject("proj", true);
  if (!p) throw new Error("no project");
  return p;
}

describe("WikiNature", () => {
  it("reports not a wiki when the nature file is absent", async () => {
    const nature = wikiNatureOf(await project(setup({ "proj/a.md": "x" })));
    expect(await nature.exists()).toBe(false);
  });

  it("initialize materializes the nature", async () => {
    const nature = wikiNatureOf(await project(setup({ "proj/a.md": "x" })));
    expect(await nature.exists()).toBe(false);
    await nature.initialize(CONFIG);
    expect(await nature.exists()).toBe(true);
  });

  it("scan exposes granular run/status/restartFrom/stop controls", async () => {
    const nature = wikiNatureOf(await project(setup({ "proj/a.md": "x" })));
    await nature.initialize(CONFIG);
    const scan = nature.scan();
    expect(typeof scan.run).toBe("function");
    expect(typeof scan.status).toBe("function");
    expect(typeof scan.restartFrom).toBe("function");
    expect(typeof scan.stop).toBe("function");
  });

  describe("embedding freeze", () => {
    // A project whose index was already built with CONFIG's embedding model/dim.
    const builtIndex = {
      "proj/.project/index/search.json": JSON.stringify({
        model: CONFIG.embedModel,
        dimensionality: CONFIG.dimensionality,
      }),
    };

    it("blocks an embedding-model change after the index is built", async () => {
      const nature = wikiNatureOf(await project(setup(builtIndex)));
      await nature.initialize(CONFIG);
      await expect(
        nature.reconfigure({ ...CONFIG, embedModel: "openai:text-embedding-3-large" }),
      ).rejects.toBeInstanceOf(WikiEmbeddingFrozenError);
    });

    it("blocks a dimensionality change after the index is built", async () => {
      const nature = wikiNatureOf(await project(setup(builtIndex)));
      await nature.initialize(CONFIG);
      await expect(nature.reconfigure({ ...CONFIG, dimensionality: 16 })).rejects.toBeInstanceOf(
        WikiEmbeddingFrozenError,
      );
    });

    it("allows a language-stage change on a built index", async () => {
      const nature = wikiNatureOf(await project(setup(builtIndex)));
      await nature.initialize(CONFIG);
      await expect(
        nature.reconfigure({ ...CONFIG, models: { default: "openai:gpt-4.1" } }),
      ).resolves.toBeUndefined();
    });
  });
});
