import { Commands } from "@statewalker/shared-commands";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { Workspace } from "@statewalker/workspace.core";
import { describe, expect, it } from "vitest";
import {
  createWikiTools,
  registerWikiCommands,
  WikiAskCommand,
  WikiReclusterTopicsCommand,
  WikiSearchCommand,
  wikiAsk,
  wikiSearch,
} from "../../src/index.js";
import { buildMultiWikiWorkspace } from "../util/multi-wiki-fixture.js";

// biome-ignore lint/suspicious/noExplicitAny: minimal tool-call options for the test
const execOpts = { toolCallId: "t", messages: [] } as any;

describe("wiki commands", () => {
  it("wiki:search resolves the same result as the wiki_search tool", async () => {
    const workspace = await buildMultiWikiWorkspace();
    const off = registerWikiCommands(workspace);
    const commands = workspace.requireAdapter(Commands);

    const viaCommand = await commands.call(WikiSearchCommand, { query: "Acme founders" }).promise;
    const viaTool = await createWikiTools(workspace).wiki_search?.execute?.(
      { query: "Acme founders" },
      execOpts,
    );
    expect(viaCommand).toEqual(viaTool);
    expect(viaCommand.matches.length).toBeGreaterThan(0);
    off();
  });

  it("wiki:ask resolves per-project answers matching the shared core", async () => {
    const workspace = await buildMultiWikiWorkspace();
    const off = registerWikiCommands(workspace);
    const commands = workspace.requireAdapter(Commands);

    const viaCommand = await commands.call(WikiAskCommand, {
      question: "Who founded Acme?",
      paths: ["*/docs/*"],
    }).promise;
    const viaCore = await wikiAsk(workspace, {
      question: "Who founded Acme?",
      paths: ["*/docs/*"],
    });
    expect(viaCommand).toEqual(viaCore);
    expect(viaCommand.answers.map((a) => a.project).sort()).toEqual(["a", "b"]);
    off();
  });

  it("wiki:recluster-topics is registered and resolves (no-op for an unknown project)", async () => {
    const workspace = await buildMultiWikiWorkspace();
    const off = registerWikiCommands(workspace);
    const commands = workspace.requireAdapter(Commands);
    // The handler claims the command and settles it; an unknown project is a no-op.
    await expect(
      commands.call(WikiReclusterTopicsCommand, { project: "no-such-wiki" }).promise,
    ).resolves.toBeUndefined();
    off();
  });

  it("commands resolve with an empty result when no wiki is bound", async () => {
    const workspace = new Workspace().setFileSystem(new MemFilesApi());
    await workspace.open();
    const off = registerWikiCommands(workspace);
    const commands = workspace.requireAdapter(Commands);

    const search = await commands.call(WikiSearchCommand, { query: "anything" }).promise;
    const ask = await commands.call(WikiAskCommand, { question: "anything?" }).promise;
    expect(search).toEqual({ availableWikis: [], matches: [] });
    expect(ask).toEqual({ availableWikis: [], answers: [] });
    // Matches the shared core's empty behaviour, not an error.
    expect(await wikiSearch(workspace, { query: "anything" })).toEqual(search);
    off();
  });
});
