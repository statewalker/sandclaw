import { Intents } from "@statewalker/shared-intents";
import { getWorkspace } from "@statewalker/workspace-api";
import type { DockviewApi, IDockviewPanel } from "dockview-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import initDock, { DockHost } from "../../dock/index.js";
import initSpecStore, { SpecStore } from "../../spec-store/index.js";
import { chatPanelId, chatSpecId } from "../public/catalog.js";
import { initChat } from "../public/init-chat.js";
import { runOpenChatSession } from "../public/intents.js";

interface FakePanel {
  id: string;
  params: Record<string, unknown>;
  focus: ReturnType<typeof vi.fn>;
}

function makeFakeApi(): {
  api: DockviewApi;
  panels: Map<string, FakePanel>;
} {
  const panels = new Map<string, FakePanel>();
  const fake = {
    addPanel: vi.fn(
      (opts: { id: string; params?: Record<string, unknown> }) => {
        const panel: FakePanel = {
          id: opts.id,
          params: opts.params ?? {},
          focus: vi.fn(),
        };
        panels.set(opts.id, panel);
        return panel as unknown as IDockviewPanel;
      },
    ),
    removePanel: vi.fn((p: { id: string }) => {
      panels.delete(p.id);
    }),
    getPanel: vi.fn(
      (id: string) => panels.get(id) as unknown as IDockviewPanel | undefined,
    ),
    get panels() {
      return Array.from(panels.values()) as unknown as IDockviewPanel[];
    },
    toJSON: vi.fn(() => ({})),
    fromJSON: vi.fn(),
    onDidLayoutChange: vi.fn(() => ({ dispose: () => {} })),
    onDidActivePanelChange: vi.fn(() => ({ dispose: () => {} })),
    activePanel: undefined,
  };
  return { api: fake as unknown as DockviewApi, panels };
}

let storage: Map<string, string>;

beforeEach(() => {
  storage = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
    clear: () => storage.clear(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("chat:open-session handler", () => {
  it("creates a per-session spec and opens a panel for a new session", async () => {
    const ctx: Record<string, unknown> = {};
    const cleanupSpec = await initSpecStore(ctx);
    const cleanupDock = await initDock(ctx);
    const cleanupChat = await initChat(ctx);
    try {
      const ws = getWorkspace(ctx);
      const intents = ws.requireAdapter(Intents);
      const store = ws.requireAdapter(SpecStore);
      const dockHost = ws.requireAdapter(DockHost);
      const { api, panels } = makeFakeApi();
      dockHost.setApi(api);

      const sessionId = "S-1";
      expect(store.get(chatSpecId(sessionId))).toBeNull();

      await runOpenChatSession(intents, { sessionId }).promise;

      const record = store.get(chatSpecId(sessionId));
      expect(record).not.toBeNull();
      expect(record?.catalogId).toBe("chat");
      expect(record?.meta.persistent).toBe(true);
      expect(panels.has(chatPanelId(sessionId))).toBe(true);
      expect(panels.get(chatPanelId(sessionId))?.params.specId).toBe(
        chatSpecId(sessionId),
      );
    } finally {
      await cleanupChat();
      await cleanupDock();
      await cleanupSpec();
    }
  });

  it("re-opening an already-open session focuses the existing panel without duplication", async () => {
    const ctx: Record<string, unknown> = {};
    const cleanupSpec = await initSpecStore(ctx);
    const cleanupDock = await initDock(ctx);
    const cleanupChat = await initChat(ctx);
    try {
      const ws = getWorkspace(ctx);
      const intents = ws.requireAdapter(Intents);
      const dockHost = ws.requireAdapter(DockHost);
      const { api, panels } = makeFakeApi();
      dockHost.setApi(api);

      await runOpenChatSession(intents, { sessionId: "S-1" }).promise;
      await runOpenChatSession(intents, { sessionId: "S-1" }).promise;

      // Only one panel created; addPanel called once.
      expect(panels.size).toBe(1);
      const panel = panels.get(chatPanelId("S-1"));
      expect(panel?.focus).toHaveBeenCalled();
    } finally {
      await cleanupChat();
      await cleanupDock();
      await cleanupSpec();
    }
  });

  it("opens a panel referencing an already-existing spec without re-creating the spec", async () => {
    const ctx: Record<string, unknown> = {};
    const cleanupSpec = await initSpecStore(ctx);
    const cleanupDock = await initDock(ctx);
    const cleanupChat = await initChat(ctx);
    try {
      const ws = getWorkspace(ctx);
      const intents = ws.requireAdapter(Intents);
      const store = ws.requireAdapter(SpecStore);
      const dockHost = ws.requireAdapter(DockHost);
      const { api, panels } = makeFakeApi();
      dockHost.setApi(api);

      // Pre-allocate the spec (e.g. layout-restore would have done this).
      const sessionId = "S-1";
      store.create({
        id: chatSpecId(sessionId),
        catalogId: "chat",
        spec: { root: "x", elements: {} },
        meta: { persistent: true },
      });
      const recordBefore = store.get(chatSpecId(sessionId));

      await runOpenChatSession(intents, { sessionId }).promise;

      const recordAfter = store.get(chatSpecId(sessionId));
      // Same record reference — handler did NOT call create again.
      expect(recordAfter).toBe(recordBefore);
      expect(panels.has(chatPanelId(sessionId))).toBe(true);
    } finally {
      await cleanupChat();
      await cleanupDock();
      await cleanupSpec();
    }
  });
});

describe("chat layout restore", () => {
  it("re-allocates chat specs for chat-shaped panels in saved layout", async () => {
    storage.set(
      "chat-mini:dock-layout",
      JSON.stringify({
        panels: {
          "chat:S-1": { id: "chat:S-1" },
          "chat:S-2": { id: "chat:S-2" },
          "files:abc": { id: "files:abc" }, // non-chat panel — ignored
        },
      }),
    );
    const ctx: Record<string, unknown> = {};
    const cleanupSpec = await initSpecStore(ctx);
    const cleanupDock = await initDock(ctx);
    const cleanupChat = await initChat(ctx);
    try {
      const ws = getWorkspace(ctx);
      const store = ws.requireAdapter(SpecStore);
      expect(store.get(chatSpecId("S-1"))?.catalogId).toBe("chat");
      expect(store.get(chatSpecId("S-2"))?.catalogId).toBe("chat");
      expect(store.get("spec:files:abc")).toBeNull();
    } finally {
      await cleanupChat();
      await cleanupDock();
      await cleanupSpec();
    }
  });

  it("is a no-op when localStorage is missing or layout is malformed", async () => {
    storage.set("chat-mini:dock-layout", "not-json{{{");
    const ctx: Record<string, unknown> = {};
    const cleanupSpec = await initSpecStore(ctx);
    const cleanupDock = await initDock(ctx);
    const cleanupChat = await initChat(ctx);
    try {
      // No throw, no specs allocated.
      const ws = getWorkspace(ctx);
      const store = ws.requireAdapter(SpecStore);
      expect(store.get(chatSpecId("anything"))).toBeNull();
    } finally {
      await cleanupChat();
      await cleanupDock();
      await cleanupSpec();
    }
  });

  it("does not duplicate specs when re-running with already-allocated specs", async () => {
    storage.set(
      "chat-mini:dock-layout",
      JSON.stringify({ panels: { "chat:S-1": {} } }),
    );
    const ctx: Record<string, unknown> = {};
    const cleanupSpec = await initSpecStore(ctx);
    const cleanupDock = await initDock(ctx);
    // First boot
    const cleanupChat1 = await initChat(ctx);
    try {
      const ws = getWorkspace(ctx);
      const store = ws.requireAdapter(SpecStore);
      const first = store.get(chatSpecId("S-1"));
      expect(first).not.toBeNull();

      // Cleanup & re-boot chat (e.g. hot-reload) — pass should
      // skip the already-present spec rather than throwing on
      // duplicate id.
      await cleanupChat1();
      const cleanupChat2 = await initChat(ctx);
      try {
        const second = store.get(chatSpecId("S-1"));
        expect(second).not.toBeNull();
      } finally {
        await cleanupChat2();
      }
    } finally {
      await cleanupDock();
      await cleanupSpec();
    }
  });
});
