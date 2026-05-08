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
  it("returns the lowest-order match for a literal mime type", () => {
    const renderers = [
      { mimeTypePattern: "text/markdown", viewKey: "md:a", order: 100 },
      { mimeTypePattern: "text/markdown", viewKey: "md:b", order: 10 },
    ];
    expect(pickRenderer(renderers, "text/markdown")?.viewKey).toBe("md:b");
  });

  it("matches glob patterns", () => {
    const renderers = [
      { mimeTypePattern: "image/*", viewKey: "image:any" },
      { mimeTypePattern: "text/*", viewKey: "text:any", order: 50 },
    ];
    expect(pickRenderer(renderers, "image/png")?.viewKey).toBe("image:any");
    expect(pickRenderer(renderers, "text/markdown")?.viewKey).toBe("text:any");
  });

  it("returns undefined when nothing matches", () => {
    expect(pickRenderer([], "text/plain")).toBeUndefined();
  });
});

describe("runVisualizeFile (Wave 5.1 stub)", () => {
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

  it("resolves when a renderer matches (panel creation deferred to W5.2)", async () => {
    const files = new MemFilesApi();
    const { ws, manager } = bootWorkspace(files);
    const slots = ws.requireAdapter(Slots);
    await ws.open();
    const intents = ws.requireAdapter(Intents);

    provideMimeRenderer(slots, {
      mimeTypePattern: "text/markdown",
      viewKey: "markdown-viewer:panel",
    });

    await expect(
      runVisualizeFile(intents, { uri: "/note.md" }).promise,
    ).resolves.toBeUndefined();

    await manager.close();
  });
});
