import { describe, expect, it } from "vitest";
import {
  type Fragment,
  fragmentsSlot,
  fromInit,
  getSlots,
  Kernel,
  kernelAdapter,
  type LazyFragment,
  startKernel,
} from "../src/index.js";

function recorder() {
  const log: string[] = [];
  const fragment = (id: string, meta: Partial<Fragment> = {}): Fragment => ({
    id,
    ...meta,
    activate: () => {
      log.push(`+${id}`);
      return () => {
        log.push(`-${id}`);
      };
    },
  });
  return { log, fragment };
}

describe("Kernel", () => {
  it("activates fragments after what they require, keeping the given order otherwise", async () => {
    const { log, fragment } = recorder();
    await startKernel({
      fragments: [
        fragment("views", { requires: ["dock"] }),
        fragment("platform"),
        fragment("dock", { requires: ["platform"] }),
        fragment("menus"),
      ],
    });
    expect(log).toEqual(["+platform", "+dock", "+views", "+menus"]);
  });

  it("honours `after` only for fragments that are part of the app", async () => {
    const { log, fragment } = recorder();
    await startKernel({
      fragments: [fragment("a", { after: ["b", "not-here"] }), fragment("b")],
    });
    expect(log).toEqual(["+b", "+a"]);
  });

  it("activates synchronous fragments synchronously", () => {
    const { log, fragment } = recorder();
    const kernel = new Kernel({ fragments: [fragment("a"), fragment("b", { requires: ["a"] })] });
    void kernel.start();
    expect(log).toEqual(["+a", "+b"]);
    expect(kernel.get("b")?.status).toBe("active");
  });

  it("awaits asynchronous activation before the fragments that come next", async () => {
    const log: string[] = [];
    const kernel = await startKernel({
      fragments: [
        {
          id: "slow",
          activate: async () => {
            await new Promise((r) => setTimeout(r, 5));
            log.push("slow");
          },
        },
        { id: "next", requires: ["slow"], activate: () => void log.push("next") },
      ],
    });
    expect(log).toEqual(["slow", "next"]);
    expect(kernel.list().map((s) => s.status)).toEqual(["active", "active"]);
  });

  it("marks a throwing fragment failed, blocks what requires it and starts the rest", async () => {
    const errors: string[] = [];
    const { log, fragment } = recorder();
    const kernel = await startKernel({
      onError: (id, _e, phase) => errors.push(`${phase}:${id}`),
      fragments: [
        {
          id: "broken",
          activate: () => {
            throw new Error("boom");
          },
        },
        fragment("needs-broken", { requires: ["broken"] }),
        fragment("needs-needs-broken", { requires: ["needs-broken"] }),
        fragment("independent"),
      ],
    });
    expect(errors).toEqual(["activate:broken"]);
    expect(log).toEqual(["+independent"]);
    expect(kernel.get("broken")?.status).toBe("failed");
    expect(kernel.get("needs-broken")?.status).toBe("blocked");
    expect(kernel.get("needs-needs-broken")?.status).toBe("blocked");
  });

  it("blocks a fragment whose requirement is not part of the app", async () => {
    const kernel = await startKernel({
      fragments: [{ id: "a", requires: ["ghost"], activate: () => {} }],
    });
    expect(kernel.get("a")?.status).toBe("blocked");
    expect(String(kernel.get("a")?.error)).toMatch(/"ghost", which is not part of the app/);
  });

  it("loads lazy fragments only when they are activated", async () => {
    let loaded = 0;
    const lazy: LazyFragment = {
      id: "lazy",
      requires: ["base"],
      load: async () => {
        loaded++;
        return {
          default: fromInit("lazy", (ctx) => {
            ctx.lazyRan = true;
          }),
        };
      },
    };
    const kernel = new Kernel({ fragments: [lazy, { id: "base", activate: () => {} }] });
    expect(loaded).toBe(0);
    await kernel.start();
    expect(loaded).toBe(1);
    expect(kernel.context.lazyRan).toBe(true);
  });

  it("accepts a module whose default export is a plain init", async () => {
    const kernel = await startKernel({
      fragments: [{ id: "plain", load: async () => ({ default: () => () => {} }) }],
    });
    expect(kernel.get("plain")?.status).toBe("active");
  });

  it("reports a module without a fragment as a load failure", async () => {
    const errors: string[] = [];
    const kernel = await startKernel({
      onError: (id, _e, phase) => errors.push(`${phase}:${id}`),
      fragments: [{ id: "empty", load: async () => ({}) }],
    });
    expect(errors).toEqual(["load:empty"]);
    expect(kernel.get("empty")?.status).toBe("failed");
  });

  it("stops fragments in reverse activation order", async () => {
    const { log, fragment } = recorder();
    const kernel = await startKernel({
      fragments: [fragment("a"), fragment("b"), fragment("c", { requires: ["a"] })],
    });
    log.length = 0;
    await kernel.stop();
    expect(log).toEqual(["-c", "-b", "-a"]);
    expect(kernel.list().every((s) => s.status === "stopped")).toBe(true);
  });

  it("attributes a cleanup error to the fragment whose cleanup threw", async () => {
    const errors: string[] = [];
    const kernel = await startKernel({
      onError: (id, _e, phase) => errors.push(`${phase}:${id}`),
      fragments: [
        { id: "no-cleanup", activate: () => {} },
        {
          id: "bad-cleanup",
          activate: () => () => {
            throw new Error("cleanup");
          },
        },
        { id: "good", activate: () => () => {} },
      ],
    });
    await kernel.stop();
    expect(errors).toEqual(["deactivate:bad-cleanup"]);
  });

  it("unloads a fragment after the fragments that require it", async () => {
    const { log, fragment } = recorder();
    const kernel = await startKernel({
      fragments: [
        fragment("base"),
        fragment("mid", { requires: ["base"] }),
        fragment("top", { requires: ["mid"] }),
        fragment("other"),
      ],
    });
    log.length = 0;
    await kernel.unload("base");
    expect(log).toEqual(["-top", "-mid", "-base"]);
    expect(kernel.get("base")).toBeUndefined();
    expect(kernel.get("mid")?.status).toBe("blocked");
    expect(kernel.get("other")?.status).toBe("active");
  });

  it("re-activates blocked fragments when their requirement is loaded again", async () => {
    const { log, fragment } = recorder();
    const kernel = await startKernel({
      fragments: [fragment("base"), fragment("plugin", { requires: ["base"] })],
    });
    await kernel.unload("base");
    log.length = 0;
    await kernel.load(fragment("base"));
    expect(log).toEqual(["+base", "+plugin"]);
    expect(kernel.get("plugin")?.status).toBe("active");
  });

  it("serializes operations issued while another one runs", async () => {
    const log: string[] = [];
    let release = () => {};
    const kernel = new Kernel({
      fragments: [
        {
          id: "gate",
          activate: () =>
            new Promise<undefined>((r) => {
              release = () => r(undefined);
            }),
        },
      ],
    });
    const started = kernel.start();
    const loaded = kernel.load({ id: "later", activate: () => void log.push("later") });
    expect(log).toEqual([]);
    release();
    await Promise.all([started, loaded]);
    expect(log).toEqual(["later"]);
  });

  it("rejects duplicate ids and dependency cycles", async () => {
    expect(
      () =>
        new Kernel({
          fragments: [
            { id: "a", activate: () => {} },
            { id: "a", activate: () => {} },
          ],
        }),
    ).toThrow(/Duplicate fragment id "a"/);
    const kernel = new Kernel({
      fragments: [
        { id: "a", requires: ["b"], activate: () => {} },
        { id: "b", requires: ["a"], activate: () => {} },
      ],
    });
    await expect(kernel.start()).rejects.toThrow(/Circular fragment dependencies among: a, b/);
  });

  it("publishes fragment states to a slot and itself to the context", async () => {
    const kernel = await startKernel({ fragments: [{ id: "a", activate: () => {} }] });
    expect(kernelAdapter.get(kernel.context)).toBe(kernel);
    const states = getSlots(kernel.context).getSnapshot(fragmentsSlot);
    expect(states.get("a")?.status).toBe("active");
  });
});

describe("Kernel teardown timing", () => {
  it("tears synchronous fragments down synchronously", () => {
    const log: string[] = [];
    const kernel = new Kernel({
      fragments: [
        { id: "a", activate: () => () => void log.push("-a") },
        { id: "b", requires: ["a"], activate: () => () => void log.push("-b") },
      ],
    });
    void kernel.start();
    void kernel.stop();
    expect(log).toEqual(["-b", "-a"]);
  });

  it("waits for an asynchronous cleanup before the next one", async () => {
    const log: string[] = [];
    const kernel = await startKernel({
      fragments: [
        { id: "a", activate: () => () => void log.push("-a") },
        {
          id: "b",
          activate: () => async () => {
            await new Promise((r) => setTimeout(r, 5));
            log.push("-b");
          },
        },
      ],
    });
    await kernel.stop();
    expect(log).toEqual(["-b", "-a"]);
  });
});
