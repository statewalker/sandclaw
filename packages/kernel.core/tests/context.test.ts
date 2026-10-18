import { Command, passthrough } from "@statewalker/shared-commands";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  actionsSlot,
  callCommand,
  configAdapter,
  createAppContext,
  defineAction,
  defineConfig,
  defineContextAdapter,
  defineService,
  getConfig,
  getService,
  getSlots,
  getView,
  handleCommand,
  isHandled,
  Kernel,
  observeService,
  provideAction,
  provideService,
  provideView,
  requireService,
  runAction,
  viewsSlot,
  waitForService,
} from "../src/index.js";

describe("context adapters", () => {
  it("create lazily, store on the context and resolve through parents", () => {
    let created = 0;
    const counter = defineContextAdapter("test:counter", () => ({ n: ++created }));
    const root = createAppContext();
    const child = createAppContext(root);
    const value = counter.get(root);
    expect(counter.get(child)).toBe(value);
    expect(created).toBe(1);
    counter.set(child, { n: 42 });
    expect(counter.get(child).n).toBe(42);
    expect(counter.get(root)).toBe(value);
  });

  it("throw without a factory, and `find` returns undefined instead", () => {
    const host = defineContextAdapter<string>("test:host");
    const ctx = createAppContext();
    expect(() => host.get(ctx)).toThrow(/Adapter not found: test:host/);
    expect(host.find(ctx)).toBeUndefined();
    host.set(ctx, "here");
    expect(host.find(ctx)).toBe("here");
    host.remove(ctx);
    expect(host.find(ctx)).toBeUndefined();
  });
});

describe("config", () => {
  const editor = defineConfig("editor", { tabSize: 2, wrap: false });

  it("merges host values over a section's defaults", () => {
    const kernel = new Kernel({ config: { editor: { wrap: true } } });
    expect(getConfig(kernel.context, editor)).toEqual({ tabSize: 2, wrap: true });
  });

  it("notifies observers of runtime changes with a new snapshot", () => {
    const ctx = createAppContext();
    const config = configAdapter.get(ctx);
    const seen: number[] = [];
    const stop = config.observe(editor, (v) => seen.push(v.tabSize));
    const before = config.get(editor);
    config.set(editor, { tabSize: 4 });
    expect(config.get(editor)).not.toBe(before);
    expect(config.get(editor)).toBe(config.get(editor));
    stop();
    config.set(editor, { tabSize: 8 });
    expect(seen).toEqual([2, 4]);
  });
});

describe("services", () => {
  const Clock = defineService<{ now(): number }>("clock");

  it("resolve to the highest-priority provider and fall back when it leaves", () => {
    const ctx = createAppContext();
    expect(getService(ctx, Clock)).toBeUndefined();
    expect(() => requireService(ctx, Clock)).toThrow(/No provider for service "clock"/);
    const fallback = { now: () => 0 };
    const real = { now: () => 1 };
    provideService(ctx, Clock, fallback, { priority: -1 });
    const withdraw = provideService(ctx, Clock, real);
    expect(getService(ctx, Clock)).toBe(real);
    withdraw();
    expect(getService(ctx, Clock)).toBe(fallback);
  });

  it("let the latest provider win among equal priorities, and notify only on change", () => {
    const ctx = createAppContext();
    const seen: Array<number | undefined> = [];
    observeService(ctx, Clock, (c) => seen.push(c?.now()));
    const a = provideService(ctx, Clock, { now: () => 1 });
    provideService(ctx, Clock, { now: () => 2 });
    a();
    expect(seen).toEqual([undefined, 1, 2]);
  });

  it("can be awaited until provided", async () => {
    const ctx = createAppContext();
    const waiting = waitForService(ctx, Clock);
    const clock = { now: () => 7 };
    provideService(ctx, Clock, clock);
    await expect(waiting).resolves.toBe(clock);
    await expect(waitForService(ctx, Clock)).resolves.toBe(clock);
    const aborted = new AbortController();
    const never = waitForService(createAppContext(), Clock, { signal: aborted.signal });
    aborted.abort(new Error("gone"));
    await expect(never).rejects.toThrow("gone");
  });
});

describe("views", () => {
  it("are registered by view key in the shared core:views slot", () => {
    const ctx = createAppContext();
    const Component = () => null;
    const stop = provideView(ctx, "chat:panel", Component);
    expect(getView(ctx, "chat:panel")).toBe(Component);
    expect(viewsSlot.key).toBe("core:views");
    stop();
    expect(getView(ctx, "chat:panel")).toBeNull();
  });
});

describe("commands and actions", () => {
  const Add = Command.async("math:add")
    .input(z.object({ a: z.number(), b: z.number() }))
    .output(z.number())
    .build();
  const Ping = Command.async("ping")
    .input(passthrough<void>())
    .output(passthrough<string>())
    .build();

  it("answer calls with the handler's value and list the command as handled", async () => {
    const ctx = createAppContext();
    expect(isHandled(ctx, Add)).toBe(false);
    const stopA = handleCommand(ctx, Add, ({ a, b }) => a + b);
    const stopB = handleCommand(ctx, Add, async ({ a, b }) => a + b, { priority: -1 });
    await expect(callCommand(ctx, Add, { a: 2, b: 3 })).resolves.toBe(5);
    stopA();
    expect(isHandled(ctx, Add)).toBe(true);
    stopB();
    expect(isHandled(ctx, Add)).toBe(false);
  });

  it("reject when the handler throws", async () => {
    const ctx = createAppContext();
    handleCommand(ctx, Ping, () => {
      throw new Error("nope");
    });
    await expect(callCommand(ctx, Ping, undefined)).rejects.toThrow();
  });

  it("run actions through their command", async () => {
    const ctx = createAppContext();
    handleCommand(ctx, Ping, () => "pong");
    const action = defineAction(Ping, undefined, { id: "ping", label: "Ping", menu: "Help" });
    provideAction(ctx, action);
    expect(getSlots(ctx).getSnapshot(actionsSlot)).toEqual([action]);
    await expect(runAction(ctx, action)).resolves.toBe("pong");
  });
});
