import { Workspace } from "@statewalker/workspace-api";
import type { ComponentType } from "react";
import { describe, expect, it } from "vitest";
import { InlineContentRegistry } from "./inline-content-registry.js";

const FakeA: ComponentType<{ props: unknown }> = () => null;
const FakeB: ComponentType<{ props: unknown }> = () => null;

describe("InlineContentRegistry", () => {
  it("registers and looks up by id", () => {
    const reg = new InlineContentRegistry();
    reg.register("metric-card", FakeA);
    expect(reg.get("metric-card")).toBe(FakeA);
    expect(reg.get("missing")).toBeNull();
  });

  it("throws on duplicate id with a different component", () => {
    const reg = new InlineContentRegistry();
    reg.register("a", FakeA);
    expect(() => reg.register("a", FakeB)).toThrow(/already registered/);
  });

  it("re-registering the same component returns a working disposer", () => {
    const reg = new InlineContentRegistry();
    const dispose1 = reg.register("a", FakeA);
    const dispose2 = reg.register("a", FakeA);
    expect(reg.get("a")).toBe(FakeA);
    dispose2();
    expect(reg.get("a")).toBeNull();
    // dispose1 is now a no-op — the entry is already gone.
    dispose1();
    expect(reg.get("a")).toBeNull();
  });

  it("notifies observers on register/dispose; fires once on subscribe", () => {
    const reg = new InlineContentRegistry();
    const seen: number[] = [];
    const dispose = reg.observe((entries) => seen.push(entries.size));

    expect(seen).toEqual([0]);
    const r1 = reg.register("a", FakeA);
    expect(seen).toEqual([0, 1]);
    r1();
    expect(seen).toEqual([0, 1, 0]);
    dispose();
  });

  it("workspace adapter: each Workspace has its own registry", () => {
    const ws1 = new Workspace();
    const ws2 = new Workspace();
    expect(ws1.requireAdapter(InlineContentRegistry)).not.toBe(
      ws2.requireAdapter(InlineContentRegistry),
    );
  });

  it("version counter bumps on register and on dispose", () => {
    const reg = new InlineContentRegistry();
    expect(reg.version).toBe(0);
    const dispose = reg.register("a", FakeA);
    expect(reg.version).toBe(1);
    // Re-registering same value: no entry change, no version bump.
    reg.register("a", FakeA);
    expect(reg.version).toBe(1);
    dispose();
    expect(reg.version).toBe(2);
    // Calling a stale disposer is a no-op for the version too.
    dispose();
    expect(reg.version).toBe(2);
  });
});
