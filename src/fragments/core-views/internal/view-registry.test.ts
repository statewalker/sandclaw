import { Workspace } from "@statewalker/workspace-api";
import { describe, expect, it, vi } from "vitest";
import type { ViewComponent } from "../public/view-registry.js";
import { ViewRegistry } from "../public/view-registry.js";

const FakeView: ViewComponent = () => null;
const OtherFakeView: ViewComponent = () => null;

describe("ViewRegistry", () => {
  it("register adds a component and returns it via get", () => {
    const reg = new ViewRegistry();
    reg.register("ui:thing", FakeView);
    expect(reg.get("ui:thing")).toBe(FakeView);
  });

  it("get returns null for unknown viewKeys", () => {
    const reg = new ViewRegistry();
    expect(reg.get("ui:missing")).toBeNull();
  });

  it("disposer removes the component and notifies observers", () => {
    const reg = new ViewRegistry();
    const cb = vi.fn();
    reg.observe(cb);
    cb.mockClear();
    const dispose = reg.register("ui:thing", FakeView);
    expect(cb).toHaveBeenCalledTimes(1);
    dispose();
    expect(cb).toHaveBeenCalledTimes(2);
    expect(reg.get("ui:thing")).toBeNull();
  });

  it("registering a duplicate viewKey with a different component throws", () => {
    const reg = new ViewRegistry();
    reg.register("ui:thing", FakeView);
    expect(() => reg.register("ui:thing", OtherFakeView)).toThrowError(
      RangeError,
    );
  });

  it("re-registering the same component reference is a no-op", () => {
    const reg = new ViewRegistry();
    reg.register("ui:thing", FakeView);
    const cb = vi.fn();
    reg.observe(cb);
    cb.mockClear();
    const dispose2 = reg.register("ui:thing", FakeView);
    expect(cb).not.toHaveBeenCalled();
    expect(reg.get("ui:thing")).toBe(FakeView);
    // Disposer remains valid — calling it removes the entry.
    dispose2();
    expect(reg.get("ui:thing")).toBeNull();
  });

  it("observe immediate snapshot includes pre-existing entries", () => {
    const reg = new ViewRegistry();
    reg.register("a", FakeView);
    reg.register("b", OtherFakeView);
    const cb = vi.fn();
    reg.observe(cb);
    expect(cb).toHaveBeenCalledTimes(1);
    const snap = cb.mock.calls[0]?.[0] as ReadonlyMap<string, ViewComponent>;
    expect(snap.get("a")).toBe(FakeView);
    expect(snap.get("b")).toBe(OtherFakeView);
  });

  it("observer dispose stops further notifications", () => {
    const reg = new ViewRegistry();
    const cb = vi.fn();
    const stop = reg.observe(cb);
    cb.mockClear();
    stop();
    reg.register("ui:thing", FakeView);
    expect(cb).not.toHaveBeenCalled();
  });

  it("workspace adapter: each Workspace has its own ViewRegistry", () => {
    const ws1 = new Workspace();
    const ws2 = new Workspace();
    const r1 = ws1.requireAdapter(ViewRegistry);
    const r2 = ws2.requireAdapter(ViewRegistry);
    expect(r1).not.toBe(r2);
    r1.register("ui:thing", FakeView);
    expect(r1.get("ui:thing")).toBe(FakeView);
    expect(r2.get("ui:thing")).toBeNull();
  });
});
