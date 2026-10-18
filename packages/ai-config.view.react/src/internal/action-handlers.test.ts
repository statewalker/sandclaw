import { createStateStore, type StateStore } from "@json-render/core";
import {
  AiConfig,
  AiConfigImpl,
  apiKeySecretKey,
  makeConnectionsInitialState,
} from "@statewalker/ai-config.core";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { Secrets, Workspace } from "@statewalker/workspace.core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildActionHandlers } from "./action-handlers.js";

/** Minimal in-memory Secrets for tests. */
class FakeSecrets extends Secrets {
  private readonly map = new Map<string, unknown>();
  async get(key: string): Promise<unknown> {
    return this.map.get(key);
  }
  async set(key: string, value: unknown): Promise<void> {
    this.map.set(key, value);
  }
  async delete(key: string): Promise<boolean> {
    return this.map.delete(key);
  }
  async list(): Promise<string[]> {
    return [...this.map.keys()];
  }
  onUpdate(): () => void {
    return () => {};
  }
}

type Handlers = ReturnType<typeof buildActionHandlers>;

interface Ctx {
  files: MemFilesApi;
  secrets: FakeSecrets;
  aiConfig: AiConfigImpl;
  store: StateStore;
  h: Handlers;
}

async function boot(): Promise<Ctx> {
  const files = new MemFilesApi();
  const secrets = new FakeSecrets();
  const ws = new Workspace().setFileSystem(files);
  ws.setAdapter(Secrets, () => secrets);
  const aiConfig = new AiConfigImpl(ws);
  await aiConfig.load();
  ws.setAdapter(AiConfig, () => aiConfig);
  const store = createStateStore(makeConnectionsInitialState());
  const h = buildActionHandlers({ aiConfig, store });
  return { files, secrets, aiConfig, store, h };
}

function stubFetch(impl: () => Promise<Response>): void {
  globalThis.fetch = impl as typeof fetch;
}
function okModels(ids: string[]): () => Promise<Response> {
  return async () =>
    new Response(JSON.stringify({ data: ids.map((id) => ({ id })) }), { status: 200 });
}

async function readConfigRaw(files: MemFilesApi): Promise<string> {
  return new Response(files.read("/.settings/ai-config.json") as never).text().catch(() => "");
}

const origFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = origFetch;
});

describe("connections action handlers", () => {
  let ctx: Ctx;
  beforeEach(async () => {
    ctx = await boot();
  });

  it("addConnection persists a key-free shell and selects the new tab", async () => {
    ctx.store.set("/ui/newConnectionType", "openai");
    await ctx.h.addConnection({});
    const conns = ctx.aiConfig.listConnections();
    expect(conns).toHaveLength(1);
    expect(conns[0]?.type).toBe("openai");
    expect(ctx.store.get("/ui/activeConnectionId")).toBe(conns[0]?.id);
    expect(await ctx.aiConfig.hasKey(conns[0]?.id ?? "")).toBe(false);
  });

  it("connect routes the key to Secrets, discovers, seeds stars, folds, no key in config", async () => {
    ctx.store.set("/ui/newConnectionType", "openai");
    await ctx.h.addConnection({});
    const id = ctx.aiConfig.listConnections()[0]?.id ?? "";
    ctx.store.set("/ui/form", {
      name: "OpenAI work",
      apiKey: "sk-1",
      url: "",
      headers: [],
      settingsOpen: true,
      testing: false,
      error: null,
    });
    stubFetch(okModels(["gpt-4o", "text-embedding-3"]));

    await ctx.h.connectConnection({});

    expect(await ctx.secrets.get(apiKeySecretKey(id))).toBe("sk-1");
    expect(ctx.aiConfig.getModels(id).map((m) => m.id)).toEqual(["gpt-4o", "text-embedding-3"]);
    expect(ctx.aiConfig.getConnection(id)?.starredModelIds).toContain("gpt-4o");
    expect(ctx.store.get("/ui/form/settingsOpen")).toBe(false);
    expect(ctx.store.get("/ui/form/error")).toBeNull();
    expect(await readConfigRaw(ctx.files)).not.toMatch(/sk-1/);
    // Auto-selects a default active model so the chat runtime can build.
    expect(ctx.aiConfig.getActive()).toEqual({ connectionId: id, modelId: "gpt-4o" });
  });

  it("connect failure surfaces the error, stays expanded, not connected, clears in-flight", async () => {
    ctx.store.set("/ui/newConnectionType", "openai");
    await ctx.h.addConnection({});
    const id = ctx.aiConfig.listConnections()[0]?.id ?? "";
    ctx.store.set("/ui/form", {
      name: "OpenAI",
      apiKey: "bad",
      url: "",
      headers: [],
      settingsOpen: true,
      testing: false,
      error: null,
    });
    stubFetch(async () => new Response("nope", { status: 401, statusText: "Unauthorized" }));

    await ctx.h.connectConnection({});

    expect(ctx.store.get("/ui/form/error")).toBeTruthy();
    expect(ctx.store.get("/ui/form/testing")).toBe(false);
    expect(ctx.store.get("/ui/form/settingsOpen")).toBe(true);
    expect(ctx.aiConfig.getModels(id)).toEqual([]);
  });

  it("connect requires a url for url-required types without ever going in-flight", async () => {
    ctx.store.set("/ui/newConnectionType", "anthropic");
    await ctx.h.addConnection({});
    ctx.store.set("/ui/form", {
      name: "Anthropic",
      apiKey: "sk-1",
      url: "",
      headers: [],
      settingsOpen: true,
      testing: false,
      error: null,
    });
    await ctx.h.connectConnection({});
    expect(ctx.store.get("/ui/form/error")).toMatch(/URL is required/);
    expect(ctx.store.get("/ui/form/testing")).toBe(false);
  });

  it("re-test with a blank key keeps the saved key (never overwrites with empty)", async () => {
    ctx.store.set("/ui/newConnectionType", "openai");
    await ctx.h.addConnection({});
    const id = ctx.aiConfig.listConnections()[0]?.id ?? "";
    // First connect with a real key.
    ctx.store.set("/ui/form", {
      name: "OpenAI",
      apiKey: "sk-saved",
      url: "",
      headers: [],
      settingsOpen: true,
      testing: false,
      error: null,
    });
    stubFetch(okModels(["gpt-4o"]));
    await ctx.h.connectConnection({});
    expect(await ctx.secrets.get(apiKeySecretKey(id))).toBe("sk-saved");

    // Re-test with the form key blank (as it is after a reload) — must KEEP the key.
    ctx.store.set("/ui/form", {
      name: "OpenAI",
      apiKey: "",
      url: "",
      headers: [],
      settingsOpen: true,
      testing: false,
      error: null,
    });
    stubFetch(okModels(["gpt-4o", "gpt-4.1"]));
    await ctx.h.connectConnection({});
    expect(await ctx.secrets.get(apiKeySecretKey(id))).toBe("sk-saved");
    expect(ctx.store.get("/ui/form/error")).toBeNull();
    expect(ctx.aiConfig.getModels(id).map((m) => m.id)).toContain("gpt-4.1");
  });

  it("connect requires a key only when none is stored yet", async () => {
    ctx.store.set("/ui/newConnectionType", "openai");
    await ctx.h.addConnection({});
    ctx.store.set("/ui/form", {
      name: "OpenAI",
      apiKey: "",
      url: "",
      headers: [],
      settingsOpen: true,
      testing: false,
      error: null,
    });
    await ctx.h.connectConnection({});
    expect(ctx.store.get("/ui/form/error")).toMatch(/API key is required/);
    expect(ctx.store.get("/ui/form/testing")).toBe(false);
  });

  it("disconnect clears the secret, models, and stars but keeps the shell", async () => {
    ctx.store.set("/ui/newConnectionType", "openai");
    await ctx.h.addConnection({});
    const id = ctx.aiConfig.listConnections()[0]?.id ?? "";
    ctx.store.set("/ui/form", {
      name: "OpenAI",
      apiKey: "sk-1",
      url: "",
      headers: [],
      settingsOpen: true,
      testing: false,
      error: null,
    });
    stubFetch(okModels(["gpt-4o"]));
    await ctx.h.connectConnection({});
    expect(ctx.aiConfig.getModels(id)).toHaveLength(1);

    await ctx.h.disconnectConnection({});

    expect(await ctx.aiConfig.hasKey(id)).toBe(false);
    expect(ctx.aiConfig.getModels(id)).toEqual([]);
    expect(ctx.aiConfig.getConnection(id)?.starredModelIds).toEqual([]);
    expect(ctx.aiConfig.getConnection(id)).toBeDefined();
    expect(ctx.store.get("/ui/form/settingsOpen")).toBe(true);
  });

  it("remove gates on a stored key: confirm dialog for keyed, immediate for keyless", async () => {
    // Keyed connection → routes through the confirm dialog first.
    ctx.store.set("/ui/newConnectionType", "openai");
    await ctx.h.addConnection({});
    const id = ctx.aiConfig.listConnections()[0]?.id ?? "";
    await ctx.aiConfig.setApiKey(id, "sk-1");

    await ctx.h.removeConnection({});
    expect(ctx.store.get("/ui/confirmRemoveOpen")).toBe(true);
    expect(ctx.aiConfig.getConnection(id)).toBeDefined();

    await ctx.h.removeConnection({ confirmed: true });
    expect(ctx.store.get("/ui/confirmRemoveOpen")).toBe(false);
    expect(ctx.aiConfig.getConnection(id)).toBeUndefined();
    expect(await ctx.secrets.get(apiKeySecretKey(id))).toBeUndefined();

    // Keyless connection → removed immediately.
    ctx.store.set("/ui/newConnectionType", "google");
    await ctx.h.addConnection({});
    const id2 = ctx.aiConfig.listConnections()[0]?.id ?? "";
    await ctx.h.removeConnection({});
    expect(ctx.aiConfig.getConnection(id2)).toBeUndefined();
  });

  it("toggleModelStar flips and persists membership", async () => {
    ctx.store.set("/ui/newConnectionType", "openai");
    await ctx.h.addConnection({});
    const id = ctx.aiConfig.listConnections()[0]?.id ?? "";
    ctx.store.set("/ui/form", {
      name: "OpenAI",
      apiKey: "sk-1",
      url: "",
      headers: [],
      settingsOpen: true,
      testing: false,
      error: null,
    });
    stubFetch(okModels(["custom-model"]));
    await ctx.h.connectConnection({});
    expect(ctx.aiConfig.getConnection(id)?.starredModelIds).not.toContain("custom-model");

    await ctx.h.toggleModelStar({ modelId: "custom-model" });
    expect(ctx.aiConfig.getConnection(id)?.starredModelIds).toContain("custom-model");
    await ctx.h.toggleModelStar({ modelId: "custom-model" });
    expect(ctx.aiConfig.getConnection(id)?.starredModelIds).not.toContain("custom-model");
  });

  it("toggleModelStar dereferences a $item state-path param to the real model id", async () => {
    // json-render hands a `$item` action param to the handler as the item's
    // state PATH, not its value — the handler must dereference it.
    ctx.store.set("/ui/newConnectionType", "openai");
    await ctx.h.addConnection({});
    const id = ctx.aiConfig.listConnections()[0]?.id ?? "";
    ctx.store.set("/persistent/active/models", [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }]);

    await ctx.h.toggleModelStar({ modelId: "/persistent/active/models/1/id" });
    expect(ctx.aiConfig.getConnection(id)?.starredModelIds).toEqual(["gpt-4o-mini"]);
    expect(ctx.aiConfig.getConnection(id)?.starredModelIds).not.toContain(
      "/persistent/active/models/1/id",
    );
  });

  it("addHeader / removeHeader mutate the form headers", async () => {
    await ctx.h.addHeader({});
    await ctx.h.addHeader({});
    expect(ctx.store.get("/ui/form/headers")).toHaveLength(2);
    await ctx.h.removeHeader({ index: 0 });
    expect(ctx.store.get("/ui/form/headers")).toHaveLength(1);
  });
});
