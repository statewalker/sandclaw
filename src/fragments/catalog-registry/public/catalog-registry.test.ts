import { Workspace } from "@statewalker/workspace-api";
import { describe, expect, it, vi } from "vitest";
import { CatalogRegistry } from "./catalog-registry.js";

function makeEntry(label: string): unknown {
  return { __label: label };
}

describe("CatalogRegistry", () => {
  it("register adds an entry and returns it via get", () => {
    const reg = new CatalogRegistry();
    const e = makeEntry("a");
    reg.register("k", e);
    expect(reg.get("k")).toBe(e);
  });

  it("register notifies observers on add", () => {
    const reg = new CatalogRegistry();
    const cb = vi.fn();
    reg.observe(cb);
    cb.mockClear();
    const e = makeEntry("a");
    reg.register("k", e);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0]?.[0].get("k")).toBe(e);
  });

  it("registering a duplicate id with a different entry throws", () => {
    const reg = new CatalogRegistry();
    reg.register("k", makeEntry("first"));
    expect(() => reg.register("k", makeEntry("second"))).toThrowError(
      RangeError,
    );
  });

  it("re-registering the same entry reference is a no-op", () => {
    const reg = new CatalogRegistry();
    const e = makeEntry("a");
    const cb = vi.fn();
    reg.register("k", e);
    reg.observe(cb);
    cb.mockClear();
    const dispose2 = reg.register("k", e);
    expect(cb).not.toHaveBeenCalled();
    expect(reg.get("k")).toBe(e);
    // Disposer remains valid — calling it removes the entry exactly once.
    dispose2();
    expect(reg.get("k")).toBeNull();
  });

  it("disposer removes the entry and notifies", () => {
    const reg = new CatalogRegistry();
    const cb = vi.fn();
    reg.observe(cb);
    cb.mockClear();
    const dispose = reg.register("k", makeEntry("a"));
    expect(cb).toHaveBeenCalledTimes(1);
    dispose();
    expect(cb).toHaveBeenCalledTimes(2);
    expect(reg.get("k")).toBeNull();
  });

  it("observe immediate snapshot includes pre-existing entries", () => {
    const reg = new CatalogRegistry();
    const a = makeEntry("a");
    const b = makeEntry("b");
    reg.register("a", a);
    reg.register("b", b);
    const cb = vi.fn();
    reg.observe(cb);
    expect(cb).toHaveBeenCalledTimes(1);
    const snap = cb.mock.calls[0]?.[0] as ReadonlyMap<string, unknown>;
    expect(snap.get("a")).toBe(a);
    expect(snap.get("b")).toBe(b);
  });

  it("get returns null for unknown ids", () => {
    const reg = new CatalogRegistry();
    expect(reg.get("missing")).toBeNull();
  });

  it("disposer is idempotent and removes only its own entry", () => {
    const reg = new CatalogRegistry();
    const e = makeEntry("a");
    const dispose = reg.register("k", e);
    dispose();
    dispose(); // second call is a no-op
    expect(reg.get("k")).toBeNull();
  });

  it("observer dispose stops further notifications", () => {
    const reg = new CatalogRegistry();
    const cb = vi.fn();
    const stop = reg.observe(cb);
    cb.mockClear();
    stop();
    reg.register("k", makeEntry("a"));
    expect(cb).not.toHaveBeenCalled();
  });

  it("workspace adapter: each Workspace has its own CatalogRegistry", () => {
    const ws1 = new Workspace();
    const ws2 = new Workspace();
    const r1 = ws1.requireAdapter(CatalogRegistry);
    const r2 = ws2.requireAdapter(CatalogRegistry);
    expect(r1).not.toBe(r2);
    r1.register("k", makeEntry("a"));
    expect(r1.get("k")).not.toBeNull();
    expect(r2.get("k")).toBeNull();
  });
});
