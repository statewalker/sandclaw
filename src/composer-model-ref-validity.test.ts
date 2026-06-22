import type { Connection } from "@statewalker/ai-config.core";
import { describe, expect, it } from "vitest";
import { buildChoices, isModelRefValid } from "./composer-model-ref-validity.js";

/** Minimal Connection builder. `discovered` doubles as the discovery cache;
 * an empty array models a Disconnected connection (no cached models). */
function conn(
  id: string,
  opts: { starred?: string[]; discovered?: string[]; name?: string } = {},
): Connection {
  const discovered = opts.discovered ?? [];
  return {
    id,
    type: "openai",
    name: opts.name ?? id,
    starredModelIds: opts.starred ?? [],
    discoveredModels: discovered.map((m) => ({ id: m, label: m })),
  };
}

describe("isModelRefValid", () => {
  const connections = [
    conn("openai", { starred: ["gpt-4o"], discovered: ["gpt-4o", "text-embedding-3-small"] }),
    conn("google", { starred: ["gemini-1.5-pro"], discovered: ["gemini-1.5-pro"] }),
  ];

  it("accepts a connected, starred, chat-capable model", () => {
    expect(isModelRefValid(connections, { connectionId: "openai", modelId: "gpt-4o" })).toBe(true);
  });

  it("rejects an undefined ref", () => {
    expect(isModelRefValid(connections, undefined)).toBe(false);
  });

  it("rejects a ref to a removed connection", () => {
    expect(isModelRefValid(connections, { connectionId: "deleted", modelId: "gpt-4o" })).toBe(false);
  });

  it("rejects a ref when the connection is disconnected (no discovered models)", () => {
    const disconnected = [conn("openai", { starred: ["gpt-4o"], discovered: [] })];
    expect(isModelRefValid(disconnected, { connectionId: "openai", modelId: "gpt-4o" })).toBe(false);
  });

  it("rejects a model that is no longer starred", () => {
    const unstarred = [conn("openai", { starred: [], discovered: ["gpt-4o"] })];
    expect(isModelRefValid(unstarred, { connectionId: "openai", modelId: "gpt-4o" })).toBe(false);
  });

  it("rejects a non-chat-capable model (embedding)", () => {
    const embed = [
      conn("openai", {
        starred: ["text-embedding-3-small"],
        discovered: ["text-embedding-3-small"],
      }),
    ];
    expect(
      isModelRefValid(embed, { connectionId: "openai", modelId: "text-embedding-3-small" }),
    ).toBe(false);
  });

  it("evaluates two session refs independently (no cross-talk; switching flips readiness)", () => {
    const conns = [
      conn("openai", { starred: ["gpt-4o"], discovered: ["gpt-4o"] }),
      conn("google", { starred: ["gemini-1.5-pro"], discovered: [] }), // disconnected
    ];
    const sessionA = { connectionId: "openai", modelId: "gpt-4o" };
    const sessionB = { connectionId: "google", modelId: "gemini-1.5-pro" };
    expect(isModelRefValid(conns, sessionA)).toBe(true);
    expect(isModelRefValid(conns, sessionB)).toBe(false);
  });
});

describe("buildChoices", () => {
  it("includes connected + starred + discovered + chat-capable models only", () => {
    const connections = [
      conn("openai", {
        name: "OpenAI",
        starred: ["gpt-4o", "text-embedding-3-small", "ghost"],
        discovered: ["gpt-4o", "text-embedding-3-small"],
      }),
      conn("google", { name: "Google", starred: ["gemini-1.5-pro"], discovered: [] }), // disconnected
    ];
    const rows = buildChoices(connections);
    expect(rows.map((r) => r.value)).toEqual(["openai::gpt-4o"]);
    expect(rows[0]).toMatchObject({
      connectionId: "openai",
      modelId: "gpt-4o",
      providerLabel: "OpenAI",
    });
  });

  it("returns an empty list when no connection is connected", () => {
    expect(buildChoices([conn("openai", { starred: ["gpt-4o"], discovered: [] })])).toEqual([]);
  });
});
