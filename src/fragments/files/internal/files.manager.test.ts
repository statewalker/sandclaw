import { Intents } from "@statewalker/shared-intents";
import { Slots } from "@statewalker/shared-slots";
import { readText, writeText } from "@statewalker/webrun-files";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { Workspace } from "@statewalker/workspace-api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ActiveModel,
  AgentRuntimeAdapter,
  type AgentToolContribution,
  observeAgentTools,
} from "@/fragments/agent-runtime";
import { handleShowDockPanel } from "@/fragments/dock";
import { SpecStore } from "@/fragments/spec-store";
import {
  provideMimeRenderer,
  runDeleteFile,
  runLoadDirectory,
  runLoadFile,
  runMoveFile,
  runVisualizeFile,
  runWriteFile,
} from "../index.js";
import { FilesManager, pickRenderer } from "./files.manager.js";

function bootWorkspace(files: MemFilesApi): {
  ws: Workspace;
  manager: FilesManager;
} {
  const ws = new Workspace();
  ws.setAdapter(ActiveModel);
  ws.setAdapter(AgentRuntimeAdapter);
  ws.setFileSystem(files, "test");
  const manager = new FilesManager({ workspace: ws });
  return { ws, manager };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("FilesManager", () => {
  it("runLoadDirectory lists workspace.files entries with mime types", async () => {
    const files = new MemFilesApi();
    await writeText(files, "/notes/hello.md", "# hi");
    await writeText(files, "/notes/data.json", '{"k":1}');
    const { ws, manager } = bootWorkspace(files);
    await ws.open();
    const intents = ws.requireAdapter(Intents);

    const entries = await runLoadDirectory(intents, { path: "/notes" }).promise;
    expect(entries.map((e) => e.name).sort()).toEqual([
      "data.json",
      "hello.md",
    ]);
    expect(entries.find((e) => e.name === "hello.md")?.mimeType).toBe(
      "text/markdown",
    );
    expect(entries.find((e) => e.name === "data.json")?.mimeType).toBe(
      "application/json",
    );

    await manager.close();
  });

  it("runLoadFile / runWriteFile / runDeleteFile round-trip", async () => {
    const files = new MemFilesApi();
    const { ws, manager } = bootWorkspace(files);
    await ws.open();
    const intents = ws.requireAdapter(Intents);

    await runWriteFile(intents, { path: "/a.txt", content: "hello" }).promise;
    const loaded = await runLoadFile(intents, { path: "/a.txt" }).promise;
    expect(new TextDecoder().decode(loaded.bytes)).toBe("hello");
    expect(loaded.mimeType).toBe("text/plain");

    await runDeleteFile(intents, { path: "/a.txt" }).promise;
    expect(await files.exists("/a.txt")).toBe(false);

    await manager.close();
  });

  it("runMoveFile renames a file", async () => {
    const files = new MemFilesApi();
    await writeText(files, "/a.md", "old");
    const { ws, manager } = bootWorkspace(files);
    await ws.open();
    const intents = ws.requireAdapter(Intents);

    await runMoveFile(intents, { fromPath: "/a.md", toPath: "/b.md" }).promise;
    expect(await files.exists("/a.md")).toBe(false);
    expect(await readText(files, "/b.md")).toBe("old");

    await manager.close();
  });

  it("intents reject when the workspace is closed", async () => {
    const files = new MemFilesApi();
    const { ws, manager } = bootWorkspace(files);
    // ws not opened — intents must reject.
    const intents = ws.requireAdapter(Intents);
    await expect(runLoadDirectory(intents, {}).promise).rejects.toThrow(
      /open workspace/,
    );
    await manager.close();
    void ws;
  });

  it("contributes a ToolFactory to agent:tools per workspace cycle", async () => {
    const files = new MemFilesApi();
    const { ws, manager } = bootWorkspace(files);
    const slots = ws.requireAdapter(Slots);

    const observed: Array<readonly AgentToolContribution[]> = [];
    const dispose = observeAgentTools(slots, (vs) => observed.push(vs));

    expect(observed.at(-1)?.length ?? 0).toBe(0);

    await ws.open();
    expect(observed.at(-1)?.length).toBe(1);

    await ws.close();
    expect(observed.at(-1)?.length).toBe(0);

    // Cycle 2: fresh contribution.
    await ws.open();
    expect(observed.at(-1)?.length).toBe(1);

    dispose();
    await manager.close();
  });
});

describe("pickRenderer", () => {
  const buildPanel = () => ({
    catalogId: "x",
    spec: {},
    panelId: "x",
    specId: "x",
  });

  it("returns the lowest-order match for a literal mime type", () => {
    const renderers = [
      { mimeTypePattern: "text/markdown", buildPanel, order: 100 },
      { mimeTypePattern: "text/markdown", buildPanel, order: 10 },
    ];
    expect(pickRenderer(renderers, "text/markdown")?.order).toBe(10);
  });

  it("matches glob patterns", () => {
    const renderers = [
      { mimeTypePattern: "image/*", buildPanel },
      { mimeTypePattern: "text/*", buildPanel, order: 50 },
    ];
    expect(pickRenderer(renderers, "image/png")?.mimeTypePattern).toBe(
      "image/*",
    );
    expect(pickRenderer(renderers, "text/markdown")?.mimeTypePattern).toBe(
      "text/*",
    );
  });

  it("returns undefined when nothing matches", () => {
    expect(pickRenderer([], "text/plain")).toBeUndefined();
  });
});

describe("runVisualizeFile", () => {
  it("rejects when no mime-renderer is registered for the URI", async () => {
    const files = new MemFilesApi();
    const { ws, manager } = bootWorkspace(files);
    await ws.open();
    const intents = ws.requireAdapter(Intents);

    await expect(
      runVisualizeFile(intents, { uri: "/note.md" }).promise,
    ).rejects.toThrow(/mime-renderer/);

    await manager.close();
  });

  it("creates a spec, opens a dock panel, and is idempotent on reopen", async () => {
    const files = new MemFilesApi();
    const ws = new Workspace();
    ws.setAdapter(ActiveModel);
    ws.setAdapter(AgentRuntimeAdapter);
    ws.setFileSystem(files, "test");
    const manager = new FilesManager({ workspace: ws });
    const slots = ws.requireAdapter(Slots);
    const store = ws.requireAdapter(SpecStore);
    const intents = ws.requireAdapter(Intents);

    // Stand-in dock handler — replaces the dock fragment in this
    // unit test. Captures show-panel calls for assertion.
    const shows: Array<{ panelId: string; specId: string }> = [];
    const disposeDock = handleShowDockPanel(intents, (intent) => {
      shows.push({
        panelId: intent.payload.panelId,
        specId: intent.payload.specId,
      });
      intent.resolve();
      return true;
    });

    await ws.open();

    provideMimeRenderer(slots, {
      mimeTypePattern: "text/markdown",
      buildPanel: (uri) => ({
        catalogId: "markdown-viewer",
        spec: {
          root: "panel",
          elements: {
            panel: { type: "MarkdownView", props: { uri }, children: [] },
          },
        },
        panelId: `markdown-viewer:${uri}`,
        specId: `spec:markdown-viewer:${uri}`,
      }),
    });

    await runVisualizeFile(intents, { uri: "/note.md" }).promise;
    expect(shows).toEqual([
      {
        panelId: "markdown-viewer:/note.md",
        specId: "spec:markdown-viewer:/note.md",
      },
    ]);
    expect(store.get("spec:markdown-viewer:/note.md")).not.toBeNull();
    expect(store.get("spec:markdown-viewer:/note.md")?.catalogId).toBe(
      "markdown-viewer",
    );

    // Reopen: same spec id, no duplicate create — dock is asked
    // again (it focuses internally), but SpecStore.create is NOT
    // called twice.
    await runVisualizeFile(intents, { uri: "/note.md" }).promise;
    expect(shows).toHaveLength(2);

    disposeDock();
    await manager.close();
  });
});
