# @statewalker/kernel.core

## What it is

The extension kernel every app in this repository runs on. An app is a list of **fragments** (plugins). The **kernel loader** orders them by what each one `requires` and activates them one by one. The **app context** they all receive holds the common systems and configs, and fragments reach these only through **context adapters**. **Services and views are slot contributions**, and fragments **call each other only through commands**. The package has no React and no DOM.

## Why it exists

Before it, the substrate had four mechanisms that did not meet:

- a fixed list of `init(ctx)` calls in `app-shell`, ordered only by position;
- `backbone.core`'s module resolver, which no app used;
- workspace class adapters;
- the slot and command buses, reached through the workspace.

None of them had fragment metadata, failure isolation or runtime loading. This package puts one small contract under all of them: a fragment's id and requirements, and how it gets at shared state. The existing `<pkg>/fragment` inits run unchanged, through `fromInit`.

## How to use

```sh
pnpm add @statewalker/kernel.core
```

| Import | Provides |
| --- | --- |
| `Kernel`, `startKernel`, `kernelAdapter`, `fragmentsSlot` | The loader: `add`, `start`, `load`, `unload`, `stop`, `get`, `list`. Each fragment's state is published to `kernel:fragments`. |
| `defineFragment`, `fromInit`, `importFragment`, `Fragment`, `LazyFragment` | Fragment descriptors: `{ id, requires?, after?, activate }`, or `{ id, requires?, load }` for code loaded on demand. |
| `defineContextAdapter`, `createAppContext`, `AppContext` | Typed accessors for values in the app context, which may have a parent. |
| `slotsAdapter`, `commandsAdapter`, `handledCommandsAdapter`, `loggerAdapter`, `getSlots`, `getCommands`, `getLogger` | The systems every app has. Each is created lazily; a host may replace any of them. |
| `defineConfig`, `getConfig`, `configAdapter`, `AppConfig` | Typed configuration sections with defaults; the host supplies values by key. |
| `defineService`, `provideService`, `getService`, `requireService`, `observeService`, `waitForService` | Services as slot contributions, chosen by priority. |
| `viewsSlot`, `provideView`, `getView` | Components registered by view key in `core:views`, the same slot `ui.view.react` reads. |
| `handleCommand`, `callCommand`, `isHandled` | Answer and call `@statewalker/shared-commands` declarations; handled commands are tracked. |
| `actionsSlot`, `defineAction`, `provideAction`, `runAction`, `Action` | User-facing actions: a command, its payload and where to show it (menu, order, shortcut). |

## Examples

### An app made of fragments

```ts
import { Command, passthrough } from "@statewalker/shared-commands";
import {
  callCommand, defineConfig, defineService, getConfig, handleCommand,
  provideService, requireService, startKernel,
} from "@statewalker/kernel.core";

const Greeter = defineService<{ greet(name: string): string }>("greeter");
const greeting = defineConfig("greeting", { text: "Hello" });
const Greet = Command.async("greet").input(passthrough<{ name: string }>()).output(passthrough<string>()).build();

const kernel = await startKernel({
  config: { greeting: { text: "Bonjour" } },
  fragments: [
    {
      id: "greet.command",
      requires: ["greeter"],
      activate: (ctx) => handleCommand(ctx, Greet, ({ name }) => requireService(ctx, Greeter).greet(name)),
    },
    {
      id: "greeter",
      activate: (ctx) =>
        provideService(ctx, Greeter, { greet: (n) => `${getConfig(ctx, greeting).text}, ${n}` }),
    },
  ],
});

await callCommand(kernel.context, Greet, { name: "Ada" }); // "Bonjour, Ada"
```

`greeter` is activated first because `greet.command` requires it. Fragments without constraints keep the order they were listed in.

### Load a plugin at runtime

```ts
await kernel.load({ id: "charts", requires: ["greeter"], load: () => import("@acme/charts/fragment") });
await kernel.unload("greeter"); // deactivates "greet.command" and "charts" first; both become "blocked"
await kernel.load(greeterAgain); // re-activates the fragments it unblocks
```

### A context adapter

```ts
export const clockAdapter = defineContextAdapter<Clock>("app:clock", () => new SystemClock());

// a host or a test
clockAdapter.set(ctx, new FakeClock());
// any fragment
const clock = clockAdapter.get(ctx);
```

### A menu entry

```ts
provideAction(ctx, defineAction(OpenSettingsCommand, {}, { id: "settings", menu: "System", label: "Settings", icon: SettingsIcon }));
```

The menubar in `@statewalker/app-shell` shows every action that has a `menu`. Clicking the entry calls the command.

## Internals

### Ordering

`orderNodes` is a stable topological sort. Each fragment comes after the fragments it `requires` or runs `after`. Apart from that, the given order is kept, so a host's listing still decides everything the requirements leave open.

- An unknown id in `after` is ignored.
- An unknown id in `requires` blocks the fragment: `Requires "x", which is not part of the app`.
- Duplicate ids throw.
- A cycle rejects `start` with `Circular fragment dependencies among: a, b`.

### Failure isolation

A fragment whose `load` or `activate` throws becomes `failed` and is reported to `onError(id, error, phase)`. By default that goes to `loggerAdapter`. Fragments that require it, directly or transitively, become `blocked`. Every other fragment still starts.

If a cleanup throws, the error is reported against the fragment that owns the cleanup, and teardown continues.

### Synchronous by default

Activation and teardown await only fragments that actually return a promise. When every fragment touched by `start` or `stop` is synchronous, the work is complete when the call returns, and the returned promise only reports completion. This lets `bootShell` mount React in the same tick as before.

Operations are serialized. A `load` issued while `start` is still awaiting an asynchronous fragment runs after it.

### Context adapters

`defineContextAdapter` wraps `@statewalker/shared-adapters`' `newAdapter`, so lookups walk the `parent` chain. A factory stores the value it creates on the context it was asked from.

The kernel's systems use the `kernel:*` keys. `viewsSlot` deliberately uses `core:views`, so components registered here resolve in the existing React host without any bridge.

### Services

A service declaration is a plain slot of `{ value, priority, seq }` providers. The highest priority wins; among equal priorities, the latest provider wins.

Withdrawing a provider falls back to the next one. `observeService` reports each change, including the change to `undefined` when the last provider leaves.

### Commands

`handleCommand` claims every call it receives. It settles the call with the handler's return value, or rejects it when the handler throws. It also records the declaration in `handledCommandsAdapter`, with a reference count per key. Menus and agent tool lists use that registry to offer only commands that someone answers.

### Dependencies

- `@statewalker/shared-adapters`: context adapters.
- `@statewalker/shared-slots`: the slot bus.
- `@statewalker/shared-commands`: the command bus and registry.

## License

MIT. See [LICENSE](../../LICENSE).
