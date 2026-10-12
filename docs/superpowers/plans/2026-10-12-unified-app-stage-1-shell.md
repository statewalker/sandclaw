# Unified App — Stage 1: Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An **App** story in `apps/ui-protos.app` that shows the whole Sandclaw app after joining a mesh: Theia-style menus, an activity bar, the commander dock with every main view, a Settings dialog, on desktop, tablet and phone.

**Architecture:** The App layer (`src/app/`) owns one `Slots` bus and one `Commands` bus per App instance. Feature modules contribute views, menu items, settings sections, header items and overlays to slots, and handle commands. The shell renders from the slots and handles the dock and Settings commands. Prototype components keep plain props; only small, optional props are added to them.

**Tech Stack:** React 19, dockview-react 8.4, `@statewalker/shared-slots` 0.2, `@statewalker/shared-commands` 0.2, `radix-ui` (Menubar, DropdownMenu), Tailwind 4, Storybook 10, Vitest + jsdom + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-12-unified-app-design.md` (Stage 1). Stage 2 (one demo world, cross-view links) gets its own plan.

## Global Constraints

- Work in the worktree `~/sw-migration/work/sandclaw.worktrees/feat-unified-app`, branch `feat/unified-app`.
- Node: `export PATH=~/.nvm/versions/node/v24.21.0/bin:$PATH` before any `pnpm`.
- Kebab-case file names. Never name a React prop `role`. Biome forbids the non-null assertion `x!`.
- Tests at public seams only, against real implementations (real dockview, real buses, real components). Features defined inside a test file are test inputs, not mocks.
- Every task ends green on, run from `apps/ui-protos.app`:
  `set -o pipefail; pnpm test 2>&1 | tail -5` (check the exit status, not only the tail), `pnpm typecheck`, and from the repo root `pnpm biome check --write --unsafe apps/ui-protos.app` (never at the repo root without the path).
- Slot and command keys, verbatim: `app:views`, `app:menu-items`, `settings:tabs`, `app:header-items`, `dock:overlays`; `dock:show-panel`, `dock:close-panel`, `settings:open`, `app:layout`, `app:set-theme`, `files:new-panel`, `files:command`, `app:shortcuts`, `app:about`, `mesh:lock`.
- Menus, in this order: `File · Edit · View · Go · Assistant · Mesh · Help`.
- Modes by the App's own width: desktop ≥ 1024, compact 640–1023, mobile < 640 (`workspace-layout/responsive.ts`).
- Side sizes when laid out from scratch: left 260, right 360, bottom 48 (strip minimum 32).
- Commit trailers, at the end of every commit message:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_013q49VfKpaNy7AsN3rNRbUz
  ```
- Never push, merge or deploy as part of this plan.

## Decisions beyond the spec

These rulings narrow the spec where the code showed a simpler path; each costs little to undo.

1. **One `files:command` command with a payload** (`{ command: PanelCommand }`) instead of six `files:*` keys: the commander already dispatches panel commands by name.
2. **No `dock:focus-panel`**: `dock:show-panel` already brings an open view forward.
3. **No `adminOnly` field**: a feature reads `ctx.viewer` and leaves admin items out for a member. The App remounts when the viewer or the feature set changes, so contributions never need to change at run time.
4. **Notifications live in the bell** (the existing prototype's design); the bottom panel holds Tasks only.
5. **No First steps view and no Recent documents**: First steps is a whole-workspace mock (out of scope: onboarding); recent documents has no data in Stage 1.
6. **Link a device… opens Settings › Me** (devices are managed there); the Link a device flow is a full-screen prototype.
7. **Fill**: only Conversations needs a `fill` prop (fixed 640 px height). Other page-shaped components are placed in a scrolling `PanelPage` frame, which their `w-full max-w-*` cards already fit.
8. **The Settings `dialog` variant keeps its stand-in workspace in `settings.tsx`**; a new exported `SettingsDialog` is the controllable part the App uses.
9. **F10 focuses the menubar; Alt alone does not** (Alt alone opens the browser's menu on Linux and Windows).
10. **The App's own activity bar, overlays and phone stack**, not `SidePanelOverlays`/`MobileStack`: those are built for the Workspace story's stand-in panels (hard-coded icons, no activity bar on desktop, no More).
11. **Slot hooks are local** (`useSlotValues`, `useKeyedSlotValues`, 20 lines) rather than a dependency on `@statewalker/ui.view.react`, which pulls the workbench's app-workspace code.
12. **No `enabled?(state)` on menu items**: the commander always has an active file panel (the Files tree counts), so Edit's file commands are never without a target; a command with an empty selection does nothing (the commander's own rule).
13. **No Assistant › New chat in Stage 1**: nothing in the prototypes can start a chat from outside the Assistant panel (the spec's rule: items with nothing behind them are left out).
14. **No View › Layout › Reset**: choosing a layout already lays the dock out from scratch.
15. **The file panels belong to the shell, not the Files feature**: switching Files off removes the Files tree, the file menu items and Storages, but the center keeps its file panels (the commander dock is the App's main layout).

## Review Focus

1. **A shortcut typed into a text field** (Del in the filter box, F2 in a rename box) must stay in the field, not run the menu command. → Task 4, test "a shortcut typed into a text field stays in the field".
2. **Settings opened at a section that is not there** (a member following a deep link to Team, a feature switched off) must open at the first section, not a blank page. → Task 4, test "Ctrl+, opens Settings at the last section; a section that is not there opens the first".
3. **A center view opened after every file tab was closed** must still open in the center, not inside the left bar. → Task 4, test "a center view opens beside the active file panel, and still opens when every file tab was closed".
4. **On a phone, a file opened from a panel** must fill the screen with a way back to the same panel. → Task 4, test "phone: a file opens full screen and Back returns to its panel".
5. **A compact overlay** must close on Escape and on a click outside it. → Task 4, test "compact: side views open as overlays from the activity bar; Escape and the backdrop close them".

---

## File structure

```
apps/ui-protos.app/
  package.json                          + @statewalker/shared-slots, @statewalker/shared-commands, radix-ui
  src/app/
    contracts.ts                        every slot, command, and the shapes they carry (Task 1)
    runtime.ts                          buses, handle(), features, slot hooks, stores (Task 1)
    shell/menu-model.ts                 menus from items; shortcuts (Task 2)
    shell/menubar.tsx                   Radix menubar + shared menu classes (Task 2)
    shell/phone-menu.tsx                ☰ full-height menu (Task 2)
    shell/app-dock.ts                   dock layout functions (Task 4)
    shell/phone-stack.tsx               phone: one view at a time (Task 4)
    shell/panel-page.tsx                scrolling frame for page-shaped components (Task 4)
    shell/app-shell.tsx                 the shell (Task 4)
    features/core.tsx                   layouts, theme, Settings…, Appearance, Help (Task 5)
    features/files.tsx                  Files tree, file commands, Storages (Task 5)
    features/todos.tsx                  Todos (Task 5)
    features/sites.tsx                  Sites (Task 5)
    features/indexing.tsx               Indexing tree, Explore, What the assistant reads (Task 5)
    features/assistant.tsx              Assistant, Conversations, How it was answered (Task 5)
    features/activity.tsx               Tasks strip, the bell, Notifications settings (Task 5)
    features/mesh.tsx                   Team, identity, invitations, pill, avatar, lock (Task 5)
    app.tsx                             App: runtime + features + shell (Task 5)
    app.stories.tsx, app.mdx            the App stories (Task 6)
  src/settings/settings-model.ts        + "storages" section; generic search (Task 3)
  src/settings/settings.tsx             SettingsEntry, defaultEntries, SettingsBody, SettingsDialog (Task 3)
  src/settings/appearance.tsx           + onChange (Task 3)
  src/file-mounts/demo-storage-settings.tsx  DEMO_MOUNTS + DemoStorageSettings moved out of the story (Task 3)
  src/notifications/notifications.tsx   + embedded bell (Task 5)
  src/conversations/conversations.tsx   + fill (Task 5)
  src/workspace-layout/workspace.tsx    export FolderBar (Task 5)
  test/app-runtime.test.tsx (Task 1), app-menus.test.tsx (Task 2), settings.test.tsx (Task 3),
  app-shell.test.tsx (Task 4), app.test.tsx (Task 5), stories.test.tsx (Task 6)
```

---

### Task 1: Contracts and runtime

**Files:**
- Modify: `apps/ui-protos.app/package.json`
- Create: `apps/ui-protos.app/src/app/contracts.ts`
- Create: `apps/ui-protos.app/src/app/runtime.ts`
- Test: `apps/ui-protos.app/test/app-runtime.test.tsx`

**Interfaces:**
- Consumes: `Zone` from `src/workspace-layout/zones.ts`; `SectionGroup`, `Viewer` from `src/settings/settings-model.ts`; `PanelCommand` from `src/file-panels/file-panel.tsx`; `Commander` from `src/file-panels/use-commander.tsx`.
- Produces (later tasks use these exact names):
  - `contracts.ts`: types `Icon`, `AppView`, `MenuName`, `AppMenuItem`, `SettingsTab`, `HeaderItem`, `AppOverlay`, `AppTheme`, `AppLayoutId`; const `MENUS`; slots `appViewsSlot`, `menuItemsSlot`, `settingsTabsSlot`, `headerItemsSlot`, `overlaysSlot`; commands `ShowPanel`, `ClosePanel`, `OpenSettings`, `ApplyLayout`, `SetTheme`, `NewFilePanel`, `RunFileCommand`, `ShowShortcuts`, `ShowAbout`, `Lock`; `menuItem(command, payload, item)`.
  - `runtime.ts`: `AppRuntime`, `createRuntime()`, `handle(rt, command, fn)`, `FeatureContext`, `Feature`, `contributeAll(rt, features, ctx)`, `all(...disposers)`, `provideAll(slots, slot, values)`, `registerAll(slots, slot, values)`, `AppRuntimeContext`, `useAppRuntime()`, `useSlotValues(slot)`, `useKeyedSlotValues(slot)`, `Store<T>`, `createStore(initial)`, `useStore(store)`, `ThemeContext`.

- [ ] **Step 1: Install the dependencies**

In `apps/ui-protos.app/package.json` add to `dependencies` (keep alphabetical order):

```json
    "@statewalker/shared-commands": "catalog:",
    "@statewalker/shared-slots": "catalog:",
    "radix-ui": "catalog:",
```

Run from the worktree root:

```bash
export PATH=~/.nvm/versions/node/v24.21.0/bin:$PATH
pnpm install
```

Expected: install completes; `apps/ui-protos.app/node_modules/@statewalker/shared-slots` exists.

- [ ] **Step 2: Write the failing test**

`apps/ui-protos.app/test/app-runtime.test.tsx`:

```tsx
import { FileText } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import {
  appViewsSlot,
  menuItem,
  menuItemsSlot,
  OpenSettings,
  ShowPanel,
} from "../src/app/contracts.js";
import { all, contributeAll, createRuntime, type Feature, handle } from "../src/app/runtime.js";

const keys = (rt: ReturnType<typeof createRuntime>) => rt.handled.list().map((d) => d.key);

describe("App runtime", () => {
  it("a menu item runs its command through the handler a feature registered", async () => {
    const rt = createRuntime();
    const seen: unknown[] = [];
    const stop = handle(rt, OpenSettings, (payload) => seen.push(payload));
    menuItem(OpenSettings, { section: "me" }, { id: "x", menu: "File", label: "X" }).run(
      rt.commands,
    );
    await vi.waitFor(() => expect(seen).toEqual([{ section: "me" }]));
    expect(keys(rt)).toContain("settings:open");
    stop();
    expect(keys(rt)).not.toContain("settings:open");
  });

  it("disposing the features takes back every contribution and handler", () => {
    const rt = createRuntime();
    const feature: Feature = {
      id: "f",
      label: "F",
      contribute: (rt) =>
        all(
          rt.slots.register(appViewsSlot, "report", {
            id: "report",
            title: "Report",
            Icon: FileText,
            zone: "center",
            render: () => null,
          }),
          rt.slots.provide(
            menuItemsSlot,
            menuItem(ShowPanel, { id: "report" }, { id: "report", menu: "View", label: "Report" }),
          ),
          handle(rt, ShowPanel, () => {}),
        ),
    };
    const dispose = contributeAll(rt, [feature], {
      viewer: "admin",
      commander: { current: null },
    });
    expect(rt.slots.getSnapshot(appViewsSlot).size).toBe(1);
    expect(rt.slots.getSnapshot(menuItemsSlot)).toHaveLength(1);
    expect(keys(rt)).toContain("dock:show-panel");
    dispose();
    expect(rt.slots.getSnapshot(appViewsSlot).size).toBe(0);
    expect(rt.slots.getSnapshot(menuItemsSlot)).toHaveLength(0);
    expect(keys(rt)).not.toContain("dock:show-panel");
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run (from `apps/ui-protos.app`): `pnpm vitest --run test/app-runtime.test.tsx`
Expected: FAIL — cannot resolve `../src/app/contracts.js`.

- [ ] **Step 4: Write `src/app/contracts.ts`**

```ts
// Every slot and command of the App, in one place: features contribute to the
// slots and handle commands; the shell renders the slots and handles the dock
// and Settings commands. Keys reuse the real app's where one exists
// (dock:show-panel, dock:close-panel, settings:tabs, dock:overlays).
import {
  Command,
  type CommandDeclaration,
  type Commands,
  passthrough,
} from "@statewalker/shared-commands";
import { defineKeyedSlot, defineSlot } from "@statewalker/shared-slots";
import type { ComponentType, ReactNode } from "react";
import type { PanelCommand } from "../file-panels/file-panel.js";
import type { SectionGroup } from "../settings/settings-model.js";
import type { Zone } from "../workspace-layout/zones.js";

export type Icon = ComponentType<{ className?: string }>;

/** A view a feature adds: where it goes, and what it shows. */
export interface AppView {
  id: string;
  title: string;
  Icon: Icon;
  /** Its zone on the dock. Center views open on demand, beside the active file panel. */
  zone: Zone;
  /** A left view on the activity bar, in this order (lower first). */
  activity?: number;
  /** On a phone: a bottom-bar button, or an entry under More. Without it, opened only by a command. */
  mobile?: "tab" | "more";
  render(): ReactNode;
}

export const MENUS = ["File", "Edit", "View", "Go", "Assistant", "Mesh", "Help"] as const;
export type MenuName = (typeof MENUS)[number];

/** One menu entry; `menuItem()` builds it from a command and its payload. */
export interface AppMenuItem {
  id: string;
  menu: MenuName;
  /** Lower first; 100 when absent. */
  order?: number;
  label: string;
  Icon?: Icon;
  /** Shown beside the label and bound as a key: "Ctrl+,", "F5", "Del". */
  shortcut?: string;
  /** Puts the item in a submenu of its menu ("Layout", "Theme"). */
  submenu?: string;
  /** The key of the command it runs. */
  command: string;
  run(commands: Commands): void;
}

/** A Settings section. */
export interface SettingsTab {
  id: string;
  label: string;
  group: SectionGroup;
  keywords: string[];
  /** Lower first; the "you" sections come before the admin ones. */
  order: number;
  /** `go` switches to another section (a link inside a section). */
  render(go: (id: string) => void): ReactNode;
}

/** Something on the top bar, right of the menus. */
export interface HeaderItem {
  id: string;
  order: number;
  Component: ComponentType;
}

/** Rendered over the whole App: a dialog, the lock screen. */
export interface AppOverlay {
  id: string;
  Component: ComponentType;
}

export const appViewsSlot = defineKeyedSlot<AppView>("app:views");
export const menuItemsSlot = defineSlot<AppMenuItem>("app:menu-items");
export const settingsTabsSlot = defineKeyedSlot<SettingsTab>("settings:tabs");
export const headerItemsSlot = defineSlot<HeaderItem>("app:header-items");
export const overlaysSlot = defineSlot<AppOverlay>("dock:overlays");

export type AppTheme = "light" | "dark" | "system";
export type AppLayoutId = "assistant" | "reading";

function silent<P>(key: string): CommandDeclaration<P, void> {
  return Command.silent(key).input(passthrough<P>()).output(passthrough<void>()).build();
}

/** Opens a view in its zone, or brings it forward where it is. */
export const ShowPanel = silent<{ id: string }>("dock:show-panel");
/** Closes a dock tab: `id`, or the active one. */
export const ClosePanel = silent<{ id?: string }>("dock:close-panel");
/** Opens Settings at `section`, or at the last section shown. */
export const OpenSettings = silent<{ section?: string }>("settings:open");
/** Lays the dock out again from a predefined layout. */
export const ApplyLayout = silent<{ id: AppLayoutId }>("app:layout");
export const SetTheme = silent<{ theme: AppTheme }>("app:set-theme");
/** A file panel beside the active one, at its folder. */
export const NewFilePanel = silent<void>("files:new-panel");
/** A file panel command, run on the active file panel and its selection. */
export const RunFileCommand = silent<{ command: PanelCommand }>("files:command");
export const ShowShortcuts = silent<void>("app:shortcuts");
export const ShowAbout = silent<void>("app:about");
export const Lock = silent<void>("mesh:lock");

/** A menu entry that runs `command` with `payload`. */
export function menuItem<P>(
  command: CommandDeclaration<P, void>,
  payload: P,
  item: Omit<AppMenuItem, "command" | "run">,
): AppMenuItem {
  return {
    ...item,
    command: command.key,
    run: (commands) => {
      commands.call(command, payload).promise.catch((e: unknown) => console.error(e));
    },
  };
}
```

- [ ] **Step 5: Write `src/app/runtime.ts`**

```ts
// The App's buses and the glue features use with them. One runtime per App
// instance: two Apps on one page never see each other's contributions.
import {
  type CommandDeclaration,
  Commands,
  CommandsRegistry,
  type MutableCommandsRegistry,
} from "@statewalker/shared-commands";
import { type KeyedSlotDeclaration, type SlotDeclaration, Slots } from "@statewalker/shared-slots";
import { createContext, useContext, useSyncExternalStore } from "react";
import type { Commander } from "../file-panels/use-commander.js";
import type { Viewer } from "../settings/settings-model.js";
import type { AppTheme } from "./contracts.js";

export interface AppRuntime {
  slots: Slots;
  commands: Commands;
  /** The commands some handler answers: what menu items may name. */
  handled: MutableCommandsRegistry;
}

export function createRuntime(): AppRuntime {
  return { slots: new Slots(), commands: Commands.create(), handled: CommandsRegistry.create() };
}

/** Answers `command` with `fn` and records it as handled; returns the disposer. */
export function handle<P>(
  rt: AppRuntime,
  command: CommandDeclaration<P, void>,
  fn: (payload: P) => void,
): () => void {
  const stop = rt.commands.listen(command, (cmd) => {
    fn(cmd.payload);
  });
  rt.handled.set(command);
  return () => {
    stop();
    rt.handled.remove(command.key);
  };
}

/** What a feature knows about the App it joins. */
export interface FeatureContext {
  viewer: Viewer;
  /** The file panels' commander; the shell sets it each time it renders. */
  commander: { current: Commander | null };
}

/** A unit the App can switch on or off: everything it adds comes back with its disposer. */
export interface Feature {
  id: string;
  label: string;
  contribute(rt: AppRuntime, ctx: FeatureContext): () => void;
}

/** One disposer for many, run in reverse order. */
export function all(...disposers: Array<() => void>): () => void {
  return () => {
    for (const dispose of [...disposers].reverse()) dispose();
  };
}

export function contributeAll(
  rt: AppRuntime,
  features: Feature[],
  ctx: FeatureContext,
): () => void {
  return all(...features.map((f) => f.contribute(rt, ctx)));
}

export function provideAll<T>(slots: Slots, slot: SlotDeclaration<T>, values: T[]): () => void {
  return all(...values.map((value) => slots.provide(slot, value)));
}

export function registerAll<T extends { id: string }>(
  slots: Slots,
  slot: KeyedSlotDeclaration<T>,
  values: T[],
): () => void {
  return all(...values.map((value) => slots.register(slot, value.id, value)));
}

export const AppRuntimeContext = createContext<AppRuntime | null>(null);

export function useAppRuntime(): AppRuntime {
  const rt = useContext(AppRuntimeContext);
  if (!rt) throw new Error("The App's views need <AppRuntimeContext.Provider> around them.");
  return rt;
}

export function useSlotValues<T>(slot: SlotDeclaration<T>): readonly T[] {
  const { slots } = useAppRuntime();
  return useSyncExternalStore(
    (notify) => slots.observe(slot, () => notify()),
    () => slots.getSnapshot(slot),
  );
}

export function useKeyedSlotValues<T>(slot: KeyedSlotDeclaration<T>): ReadonlyMap<string, T> {
  const { slots } = useAppRuntime();
  return useSyncExternalStore(
    (notify) => slots.observe(slot, () => notify()),
    () => slots.getSnapshot(slot),
  );
}

/** A value a feature keeps for its own views (a dialog open, the lock), observable from React. */
export interface Store<T> {
  get(): T;
  set(value: T): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      value = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get);
}

/** The theme the shell applies; Appearance shows it. */
export const ThemeContext = createContext<AppTheme>("system");
```

- [ ] **Step 6: Run the test to see it pass**

Run: `pnpm vitest --run test/app-runtime.test.tsx`
Expected: 2 passed.

- [ ] **Step 7: Full checks**

```bash
set -o pipefail; pnpm test 2>&1 | tail -5; pnpm typecheck
cd ../.. && pnpm biome check --write --unsafe apps/ui-protos.app && cd apps/ui-protos.app
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add apps/ui-protos.app/package.json pnpm-lock.yaml apps/ui-protos.app/src/app apps/ui-protos.app/test/app-runtime.test.tsx
git commit -F - <<'EOF'
feat(ui-protos.app): App contracts and runtime — slots, commands, features

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013q49VfKpaNy7AsN3rNRbUz
EOF
```

---

### Task 2: Menus — model, menubar, phone menu

**Files:**
- Create: `apps/ui-protos.app/src/app/shell/menu-model.ts`
- Create: `apps/ui-protos.app/src/app/shell/menubar.tsx`
- Create: `apps/ui-protos.app/src/app/shell/phone-menu.tsx`
- Test: `apps/ui-protos.app/test/app-menus.test.tsx`

**Interfaces:**
- Consumes: `AppMenuItem`, `MENUS`, `MenuName`, `menuItem`, `OpenSettings`, `ApplyLayout` (Task 1).
- Produces: `MenuEntry`, `Menu`, `buildMenus(items)`, `matchesShortcut(shortcut, event)`, `isTyping(event)`; `AppMenubar({ menus, onRun })`, `menuContentClass`, `menuRowClass`; `PhoneMenu({ menus, onRun })`.

- [ ] **Step 1: Write the failing tests**

`apps/ui-protos.app/test/app-menus.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplyLayout, menuItem, OpenSettings } from "../src/app/contracts.js";
import { buildMenus, isTyping, matchesShortcut } from "../src/app/shell/menu-model.js";
import { AppMenubar } from "../src/app/shell/menubar.js";
import { PhoneMenu } from "../src/app/shell/phone-menu.js";

afterEach(cleanup);

const items = [
  menuItem(OpenSettings, {}, { id: "settings", menu: "File", order: 80, label: "Settings…", shortcut: "Ctrl+," }),
  menuItem(ApplyLayout, { id: "reading" }, { id: "reading", menu: "View", order: 80, submenu: "Layout", label: "Reading" }),
  menuItem(ApplyLayout, { id: "assistant" }, { id: "assistant", menu: "View", order: 79, submenu: "Layout", label: "Assistant" }),
  menuItem(OpenSettings, { section: "storages" }, { id: "storages", menu: "File", order: 75, label: "Storages…" }),
  menuItem(OpenSettings, { section: "me" }, { id: "me", menu: "Help", label: "About" }),
];

const key = (init: KeyboardEventInit, target?: EventTarget) => {
  const e = new KeyboardEvent("keydown", init);
  if (target) Object.defineProperty(e, "target", { value: target });
  return e;
};

describe("menu model", () => {
  it("menus follow the fixed order; items their order; a submenu sits where its first item would", () => {
    const menus = buildMenus(items);
    expect(menus.map((m) => m.name)).toEqual(["File", "View", "Help"]);
    expect(menus[0]?.entries.map((e) => (e.kind === "item" ? e.item.label : e.label))).toEqual([
      "Storages…",
      "Settings…",
    ]);
    const view = menus[1]?.entries;
    expect(view).toHaveLength(1);
    expect(view?.[0]?.kind === "submenu" && view[0].items.map((i) => i.label)).toEqual([
      "Assistant",
      "Reading",
    ]);
  });

  it("shortcuts match Ctrl or Cmd, exact modifiers, and key names", () => {
    expect(matchesShortcut("Ctrl+,", key({ key: ",", ctrlKey: true }))).toBe(true);
    expect(matchesShortcut("Ctrl+,", key({ key: ",", metaKey: true }))).toBe(true);
    expect(matchesShortcut("Ctrl+,", key({ key: "," }))).toBe(false);
    expect(matchesShortcut("F5", key({ key: "F5", ctrlKey: true }))).toBe(false);
    expect(matchesShortcut("Del", key({ key: "Delete" }))).toBe(true);
  });

  it("a plain key in a text field is typing; with Ctrl it is a shortcut", () => {
    const input = document.createElement("input");
    expect(isTyping(key({ key: "Delete" }, input))).toBe(true);
    expect(isTyping(key({ key: ",", ctrlKey: true }, input))).toBe(false);
    expect(isTyping(key({ key: "Delete" }, document.body))).toBe(false);
  });
});

describe("AppMenubar", () => {
  it("opens a menu and runs the chosen item, its shortcut shown beside it", () => {
    const onRun = vi.fn();
    render(<AppMenubar menus={buildMenus(items)} onRun={onRun} />);
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "File" }), { key: "Enter" });
    const settings = screen.getByRole("menuitem", { name: /^Settings…/ });
    expect(settings.textContent).toContain("Ctrl+,");
    fireEvent.click(settings);
    expect(onRun).toHaveBeenCalledWith(expect.objectContaining({ id: "settings" }));
  });
});

describe("PhoneMenu", () => {
  it("walks menus and submenus as pages, with Back, and runs the item", () => {
    const onRun = vi.fn();
    render(<PhoneMenu menus={buildMenus(items)} onRun={onRun} />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const sheet = screen.getByRole("dialog", { name: "Menu" });
    fireEvent.click(within(sheet).getByRole("button", { name: "View" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Layout" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Back" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Layout" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Reading" }));
    expect(onRun).toHaveBeenCalledWith(expect.objectContaining({ id: "reading" }));
    expect(screen.queryByRole("dialog", { name: "Menu" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest --run test/app-menus.test.tsx`
Expected: FAIL — cannot resolve `../src/app/shell/menu-model.js`.

- [ ] **Step 3: Write `src/app/shell/menu-model.ts`**

```ts
import { type AppMenuItem, MENUS, type MenuName } from "../contracts.js";

export type MenuEntry =
  | { kind: "item"; item: AppMenuItem }
  | { kind: "submenu"; label: string; items: AppMenuItem[] };

export interface Menu {
  name: MenuName;
  entries: MenuEntry[];
}

const byOrder = (a: AppMenuItem, b: AppMenuItem) =>
  (a.order ?? 100) - (b.order ?? 100) || a.id.localeCompare(b.id);

/**
 * The menus to show: in the fixed `MENUS` order, empty ones left out; items by
 * order; a submenu where its first item would be, holding its items in order.
 */
export function buildMenus(items: readonly AppMenuItem[]): Menu[] {
  return MENUS.flatMap((name): Menu[] => {
    const own = items.filter((i) => i.menu === name).sort(byOrder);
    if (own.length === 0) return [];
    const entries: MenuEntry[] = [];
    for (const item of own) {
      if (!item.submenu) {
        entries.push({ kind: "item", item });
        continue;
      }
      const sub = entries.find(
        (e): e is Extract<MenuEntry, { kind: "submenu" }> =>
          e.kind === "submenu" && e.label === item.submenu,
      );
      if (sub) sub.items.push(item);
      else entries.push({ kind: "submenu", label: item.submenu, items: [item] });
    }
    return [{ name, entries }];
  });
}

/** Short names in shortcuts for the browser's key names. */
const KEY_NAMES: Record<string, string> = { Del: "Delete" };

/** "Ctrl+," against a key press: Ctrl is Ctrl or Cmd; the other modifiers must match exactly. */
export function matchesShortcut(shortcut: string, e: KeyboardEvent): boolean {
  const parts = shortcut.split("+");
  const key = parts.pop() ?? "";
  return (
    (e.ctrlKey || e.metaKey) === parts.includes("Ctrl") &&
    e.shiftKey === parts.includes("Shift") &&
    e.altKey === parts.includes("Alt") &&
    e.key.toLowerCase() === (KEY_NAMES[key] ?? key).toLowerCase()
  );
}

/** A key typed into a text field belongs to the field, unless it carries Ctrl, Cmd or Alt. */
export function isTyping(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const target = e.target;
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}
```

- [ ] **Step 4: Write `src/app/shell/menubar.tsx`**

```tsx
import { ChevronRight } from "lucide-react";
import { Menubar } from "radix-ui";
import { useEffect, useRef } from "react";
import type { AppMenuItem } from "../contracts.js";
import type { Menu } from "./menu-model.js";

/** Shared by the menubar and the avatar menu. */
export const menuContentClass =
  "bg-popover text-popover-foreground z-50 min-w-48 rounded-md border p-1 shadow-md";
export const menuRowClass =
  "data-[highlighted]:bg-accent flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none";

function Entry({ item, onRun }: { item: AppMenuItem; onRun(item: AppMenuItem): void }) {
  const Icon = item.Icon;
  return (
    <Menubar.Item className={menuRowClass} onSelect={() => onRun(item)}>
      {Icon ? <Icon className="size-4" /> : <span className="size-4" />}
      <span className="flex-1">{item.label}</span>
      {item.shortcut && (
        <span className="text-muted-foreground ml-6 text-xs">{item.shortcut}</span>
      )}
    </Menubar.Item>
  );
}

/**
 * The App's menus (Radix Menubar: arrows move between menus and items, Escape
 * closes). F10 focuses the first menu, as in Theia.
 */
export function AppMenubar({ menus, onRun }: { menus: Menu[]; onRun(item: AppMenuItem): void }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F10" || e.defaultPrevented) return;
      e.preventDefault();
      bar.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Menubar.Root ref={bar} aria-label="Main menu" className="flex items-center gap-0.5">
      {menus.map((menu) => (
        <Menubar.Menu key={menu.name}>
          <Menubar.Trigger className="hover:bg-accent focus:bg-accent data-[state=open]:bg-accent rounded-sm px-2 py-1 text-sm outline-none select-none">
            {menu.name}
          </Menubar.Trigger>
          <Menubar.Portal>
            <Menubar.Content align="start" sideOffset={4} className={menuContentClass}>
              {menu.entries.map((entry) =>
                entry.kind === "item" ? (
                  <Entry key={entry.item.id} item={entry.item} onRun={onRun} />
                ) : (
                  <Menubar.Sub key={entry.label}>
                    <Menubar.SubTrigger className={menuRowClass}>
                      <span className="size-4" />
                      <span className="flex-1">{entry.label}</span>
                      <ChevronRight className="size-4" />
                    </Menubar.SubTrigger>
                    <Menubar.Portal>
                      <Menubar.SubContent className={menuContentClass}>
                        {entry.items.map((item) => (
                          <Entry key={item.id} item={item} onRun={onRun} />
                        ))}
                      </Menubar.SubContent>
                    </Menubar.Portal>
                  </Menubar.Sub>
                ),
              )}
            </Menubar.Content>
          </Menubar.Portal>
        </Menubar.Menu>
      ))}
    </Menubar.Root>
  );
}
```

- [ ] **Step 5: Write `src/app/shell/phone-menu.tsx`**

```tsx
import { Button } from "@statewalker/ui.view.shadcn";
import { ArrowLeft, ChevronRight, Menu as MenuIcon, X } from "lucide-react";
import { useState } from "react";
import type { AppMenuItem, Icon } from "../contracts.js";
import type { Menu } from "./menu-model.js";

function Row({
  label,
  Icon,
  hint,
  more,
  onClick,
}: {
  label: string;
  Icon?: Icon;
  hint?: string;
  more?: boolean;
  onClick(): void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="hover:bg-accent flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm"
      >
        {Icon ? <Icon className="size-4" /> : null}
        <span className="flex-1">{label}</span>
        {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
        {more && <ChevronRight className="text-muted-foreground size-4" />}
      </button>
    </li>
  );
}

/**
 * The phone's ☰: the same menus as the menubar, as full-height pages — the
 * menus, a menu's items, a submenu's items — with Back. It covers the App
 * (the App's root is `relative`), not the whole page.
 */
export function PhoneMenu({ menus, onRun }: { menus: Menu[]; onRun(item: AppMenuItem): void }) {
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState<string[]>([]);
  const close = () => {
    setOpen(false);
    setPath([]);
  };
  const pick = (item: AppMenuItem) => {
    close();
    onRun(item);
  };
  const [menuName, subName] = path;
  const menu = menus.find((m) => m.name === menuName);
  const sub = menu?.entries.find((e) => e.kind === "submenu" && e.label === subName);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <MenuIcon />
      </Button>
      {open && (
        <div
          role="dialog"
          aria-label="Menu"
          className="bg-background absolute inset-0 z-50 flex flex-col"
        >
          <div className="flex h-10 shrink-0 items-center gap-1 border-b px-1">
            {path.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setPath(path.slice(0, -1))}>
                <ArrowLeft /> Back
              </Button>
            )}
            <span className="min-w-0 flex-1 truncate px-2 text-sm font-medium">
              {subName ?? menuName ?? "Menu"}
            </span>
            <Button variant="ghost" size="icon" aria-label="Close menu" onClick={close}>
              <X />
            </Button>
          </div>
          <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
            {!menu
              ? menus.map((m) => (
                  <Row key={m.name} label={m.name} more onClick={() => setPath([m.name])} />
                ))
              : sub?.kind === "submenu"
                ? sub.items.map((item) => (
                    <Row
                      key={item.id}
                      label={item.label}
                      Icon={item.Icon}
                      hint={item.shortcut}
                      onClick={() => pick(item)}
                    />
                  ))
                : menu.entries.map((entry) =>
                    entry.kind === "item" ? (
                      <Row
                        key={entry.item.id}
                        label={entry.item.label}
                        Icon={entry.item.Icon}
                        hint={entry.item.shortcut}
                        onClick={() => pick(entry.item)}
                      />
                    ) : (
                      <Row
                        key={entry.label}
                        label={entry.label}
                        more
                        onClick={() => setPath([menu.name, entry.label])}
                      />
                    ),
                  )}
          </ul>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `pnpm vitest --run test/app-menus.test.tsx`
Expected: 5 passed. If the Radix menu does not open on `Enter` in jsdom, open it with `fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })` instead — Radix opens a menubar menu on either; keep the one that works and say which in the report.

- [ ] **Step 7: Full checks** — as Task 1 Step 7.

- [ ] **Step 8: Commit**

```bash
git add apps/ui-protos.app/src/app/shell apps/ui-protos.app/test/app-menus.test.tsx
git commit -F - <<'EOF'
feat(ui-protos.app): App menus — menubar, phone menu, shortcuts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013q49VfKpaNy7AsN3rNRbUz
EOF
```

---

### Task 3: Settings — entries, a controllable dialog, Storages

**Files:**
- Create: `apps/ui-protos.app/src/file-mounts/demo-storage-settings.tsx`
- Modify: `apps/ui-protos.app/src/file-mounts/storage-settings.stories.tsx` (import `DEMO_MOUNTS`, `DemoStorageSettings` from the new file; delete their definitions there)
- Modify: `apps/ui-protos.app/test/storage-settings.test.tsx:6` (import `DEMO_MOUNTS` from `../src/file-mounts/demo-storage-settings.js`)
- Modify: `apps/ui-protos.app/src/settings/settings-model.ts`
- Modify: `apps/ui-protos.app/src/settings/settings.tsx`
- Modify: `apps/ui-protos.app/src/settings/appearance.tsx:66-72`
- Test: `apps/ui-protos.app/test/settings.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `SettingsEntry` (`{ id, label, group, keywords, render(go) }`), `defaultEntries(viewer)`, `SettingsBody`, `SettingsDialog({ open, onOpenChange, entries, section?, onSectionChange?, phone? })` from `settings.tsx`; `Appearance({ value?, onChange? })`; `DemoStorageSettings({ vault, scenario?, delayMs?, ...StorageSettingsProps rest })`, `DEMO_MOUNTS` from `demo-storage-settings.tsx`. `SettingsTab` (Task 1) is structurally a `SettingsEntry` plus `order`, so the shell passes tabs as entries.

- [ ] **Step 1: Move the storage-settings demo out of the story**

Create `src/file-mounts/demo-storage-settings.tsx`: move into it, unchanged, `const ORIGIN`, `export const DEMO_MOUNTS` and the `DemoSettings` function from `storage-settings.stories.tsx`, renaming `DemoSettings` to `export function DemoStorageSettings`. Its imports are the ones those definitions use (`fakeProbe`, `ProbeScenario` from `@statewalker/file-mounts.core`; `useState`; `MockVault`, `VaultState` from `./mock-vault.js`; `StorageItem`, `StorageSettings`, `StorageSettingsProps` from `./storage-settings.js`). If `ORIGIN` is used only by the story's CORS text, leave it in the story. In the story and in `test/storage-settings.test.tsx`, import from `./demo-storage-settings.js` / `../src/file-mounts/demo-storage-settings.js`.

Run: `pnpm vitest --run test/storage-settings.test.tsx test/stories.test.tsx`
Expected: PASS (a pure move).

- [ ] **Step 2: Write the failing tests**

Append to `test/settings.test.tsx` (add `SettingsDialog`, `defaultEntries` to the `settings.js` import):

```tsx
describe("SettingsDialog", () => {
  const noop = () => {};

  it("opens at the section asked for and reports the reader's pick", () => {
    const picked: string[] = [];
    render(
      <SettingsDialog
        open
        onOpenChange={noop}
        entries={defaultEntries("admin")}
        section="appearance"
        onSectionChange={(id) => picked.push(id)}
      />,
    );
    expect(screen.getByRole("radio", { name: "Dark" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Storages" }));
    expect(picked).toEqual(["storages"]);
  });

  it("a section that is not among its entries opens the first one", () => {
    render(
      <SettingsDialog
        open
        onOpenChange={noop}
        entries={defaultEntries("member")}
        section="ai-models"
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    expect(within(nav).getByRole("button", { name: "Me" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });
});
```

And in the `sections` describe, add to the first test:

```tsx
    expect(visibleSections("member").map((s) => s.id)).toContain("storages");
```

- [ ] **Step 3: Run them to see them fail**

Run: `pnpm vitest --run test/settings.test.tsx`
Expected: FAIL — `SettingsDialog` / `defaultEntries` are not exported.

- [ ] **Step 4: Add Storages to the model; make search generic**

In `src/settings/settings-model.ts`:
- add `| "storages"` to `SectionId` after `"notifications"`;
- insert after the `notifications` entry of `sections`:

```ts
  {
    id: "storages",
    label: "Storages",
    group: "you",
    keywords: ["storage", "mount", "s3", "folder", "opfs", "vault", "keys"],
  },
```

- make `SearchHit` and `searchSections` generic over anything with a label and keywords:

```ts
export interface SearchHit<T extends { label: string; keywords: string[] } = SectionInfo> {
  section: T;
  /** The keyword that matched, when the label did not. */
  keyword?: string;
}

export function searchSections<T extends { label: string; keywords: string[] }>(
  shown: T[],
  query: string,
): SearchHit<T>[] {
  const q = fold(query.trim());
  if (!q) return shown.map((section) => ({ section }));
  const starts = (text: string) => ` ${fold(text)}`.includes(` ${q}`);
  return shown.flatMap((section): SearchHit<T>[] => {
    if (starts(section.label)) return [{ section }];
    const keyword = section.keywords.find(starts);
    return keyword ? [{ section, keyword }] : [];
  });
}
```

- [ ] **Step 5: Let Appearance report changes**

In `src/settings/appearance.tsx` replace the start of `Appearance`:

```tsx
export function Appearance({
  value: initial = { theme: "system", textSize: "default", density: "comfortable" },
  onChange,
}: {
  value?: AppearanceValue;
  /** Every change, as it is made (the App applies the theme at once). */
  onChange?(value: AppearanceValue): void;
}) {
  const [value, setValue] = useState(initial);
  const set = (patch: Partial<AppearanceValue>) => {
    const next = { ...value, ...patch };
    setValue(next);
    onChange?.(next);
  };
```

- [ ] **Step 6: Entries, body and dialog in `settings.tsx`**

Make these changes to `src/settings/settings.tsx`:

1. Imports: add `DialogDescription`, `DialogTitle` are already imported; add `import { DemoStorageSettings } from "../file-mounts/demo-storage-settings.js";`; replace the settings-model import with:

```tsx
import {
  groupLabels,
  type SearchHit,
  type SectionGroup,
  type SectionId,
  searchSections,
  type Viewer,
  visibleSections,
} from "./settings-model.js";
```

2. After `SettingsProps`, add:

```tsx
/** One section as the body shows it: its place in the list and what it renders. */
export interface SettingsEntry {
  id: string;
  label: string;
  group: SectionGroup;
  keywords: string[];
  /** `go` switches to another section (a link inside a section). */
  render(go: (id: string) => void): ReactNode;
}

/** The viewer's sections, each rendering its existing screen. */
export function defaultEntries(viewer: Viewer): SettingsEntry[] {
  return visibleSections(viewer).map((s) => ({
    ...s,
    render: (go) => <SectionView id={s.id} viewer={viewer} go={go} />,
  }));
}
```

3. `SectionView`: change `go: (id: SectionId) => void` to `go: (id: string) => void`, and add the case:

```tsx
    case "storages":
      return <DemoStorageSettings vault="unlocked" />;
```

4. `SectionList`: change its props to `hits: SearchHit<SettingsEntry>[]`, `current: string | null`, `onPick: (id: string) => void`.

5. Replace `SettingsBody` with:

```tsx
/** Navigation, search and the open section; the same inside a page and a dialog. */
export function SettingsBody({
  entries,
  section,
  onSectionChange,
  query: initialQuery = "",
  phone = false,
  header,
}: {
  entries: SettingsEntry[];
  /** The section opened first; not among `entries`: the first one. On a phone, none opens the list. */
  section?: string;
  onSectionChange?(id: string): void;
  query?: string;
  phone?: boolean;
  header: ReactNode;
}) {
  const [current, setCurrentState] = useState<string | null>(
    phone && section === undefined
      ? null
      : ((entries.find((e) => e.id === section) ?? entries[0])?.id ?? null),
  );
  const setCurrent = (id: string | null) => {
    setCurrentState(id);
    if (id) onSectionChange?.(id);
  };
  const [query, setQuery] = useState(initialQuery);
  const hits = searchSections(entries, query);
  const open = entries.find((e) => e.id === current);
```

and in the rest of the old body: the phone sub-page label becomes `const label = open?.label;`, and both `<SectionView id={current} viewer={viewer} go={setCurrent} />` become `{open?.render(setCurrent)}` (the desktop one keeps its `current &&` guard as `open?.render(setCurrent)`).

6. Add the dialog, after `SettingsBody`:

```tsx
/** Settings as a dialog over the App, which stays as it was underneath. */
export function SettingsDialog({
  open,
  onOpenChange,
  entries,
  section,
  onSectionChange,
  phone = false,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  entries: SettingsEntry[];
  section?: string;
  onSectionChange?(id: string): void;
  phone?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "grid grid-rows-[minmax(0,1fr)] gap-0 p-0",
          phone
            ? "h-svh w-screen max-w-none overflow-y-auto rounded-none sm:max-w-none"
            : "h-[min(760px,90svh)] w-[calc(100%-2rem)] max-w-[1100px] overflow-hidden sm:max-w-[1100px]",
        )}
      >
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">
          The workspace stays as it was behind this window.
        </DialogDescription>
        <SettingsBody
          entries={entries}
          section={section}
          onSectionChange={onSectionChange}
          phone={phone}
          header={<h2 className="pr-8 text-lg font-semibold">Settings</h2>}
        />
      </DialogContent>
    </Dialog>
  );
}
```

7. Replace `Settings` with:

```tsx
/** The stand-in workspace's Settings dialog: open at first, reopened from the gear. */
function DialogVariant(props: Omit<SettingsProps, "variant"> & { viewer: Viewer }) {
  const [open, setOpen] = useState(true);
  return (
    <WorkspaceBehind>
      <Button size="sm" variant="ghost" aria-label="Settings" onClick={() => setOpen(true)}>
        <SettingsIcon />
      </Button>
      <SettingsDialog
        open={open}
        onOpenChange={setOpen}
        entries={defaultEntries(props.viewer)}
        section={props.section}
      />
    </WorkspaceBehind>
  );
}

export function Settings({ variant = "page", viewer = "admin", ...props }: SettingsProps) {
  if (variant === "dialog" && !props.phone) return <DialogVariant viewer={viewer} {...props} />;

  return (
    <div
      className={cn(
        "bg-background grid w-full overflow-hidden rounded-md border",
        props.phone
          ? "max-w-[390px] content-start"
          : "h-[85svh] max-w-6xl grid-rows-[minmax(0,1fr)]",
      )}
    >
      <SettingsBody
        entries={defaultEntries(viewer)}
        section={props.section}
        query={props.query}
        phone={props.phone}
        header={
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost">
              <ArrowLeft /> Workspace
            </Button>
            <h1 className="text-lg font-semibold">Settings</h1>
          </div>
        }
      />
    </div>
  );
}
```

Remove the now-unused `DialogTrigger` import and the old `resolveSection` import (keep `resolveSection` exported from the model: its test still uses it).

- [ ] **Step 7: Run the tests to see them pass**

Run: `pnpm vitest --run test/settings.test.tsx test/stories.test.tsx test/storage-settings.test.tsx`
Expected: PASS, including the Settings dialog story.

- [ ] **Step 8: Full checks** — as Task 1 Step 7.

- [ ] **Step 9: Commit**

```bash
git add apps/ui-protos.app/src/settings apps/ui-protos.app/src/file-mounts apps/ui-protos.app/test/settings.test.tsx apps/ui-protos.app/test/storage-settings.test.tsx
git commit -F - <<'EOF'
feat(ui-protos.app): Settings entries, a controllable dialog, and a Storages section

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013q49VfKpaNy7AsN3rNRbUz
EOF
```

---

### Task 4: The shell

**Files:**
- Create: `apps/ui-protos.app/src/app/shell/app-dock.ts`
- Create: `apps/ui-protos.app/src/app/shell/panel-page.tsx`
- Create: `apps/ui-protos.app/src/app/shell/phone-stack.tsx`
- Create: `apps/ui-protos.app/src/app/shell/app-shell.tsx`
- Test: `apps/ui-protos.app/test/app-shell.test.tsx`

**Interfaces:**
- Consumes: Task 1 (contracts, runtime), Task 2 (`buildMenus`, `matchesShortcut`, `isTyping`, `AppMenubar`, `PhoneMenu`), Task 3 (`SettingsDialog`); existing `useCommander`, `ViewerBody`, `Commander` (`file-panels/use-commander.tsx`), `FilesInDock`, `CommanderPanel`, `fileContributions`, `fileDockComponents`, `fileTabComponents`, `useFilesInDock` (`file-panels/dock-files.tsx`), `MissingPanel` (`workspace-layout/panels.tsx`), `Mode`, `modeFor`, `usesDock` (`workspace-layout/responsive.ts`), `keepSideSizes`, `loadSavedLayout`, `syncZones`, `Zone` (`workspace-layout/zones.ts`).
- Produces: `AppShell({ commanderRef, initialMode? })`; `PanelPage({ children })`; from `app-dock.ts`: `VIEW`, `SIDE_SIZES`, `byActivity`, `zoneOfPanel`, `startingViews`, `layoutSides`, `showView`, `isShownLeft`, `toggleLeft`.

- [ ] **Step 1: Write the failing tests**

`apps/ui-protos.app/test/app-shell.test.tsx`:

```tsx
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { FileText, List, ListChecks, ListTodo, Sparkles } from "lucide-react";
import { afterEach, describe, expect, it } from "vitest";
import {
  ApplyLayout,
  appViewsSlot,
  menuItem,
  menuItemsSlot,
  OpenSettings,
  ShowPanel,
  settingsTabsSlot,
} from "../src/app/contracts.js";
import {
  all,
  AppRuntimeContext,
  contributeAll,
  createRuntime,
  type Feature,
  provideAll,
  registerAll,
} from "../src/app/runtime.js";
import { AppShell } from "../src/app/shell/app-shell.js";
import type { Mode } from "../src/workspace-layout/responsive.js";

afterEach(cleanup);

const fixture: Feature = {
  id: "fixture",
  label: "Fixture",
  contribute: (rt) =>
    all(
      registerAll(rt.slots, appViewsSlot, [
        { id: "outline", title: "Outline", Icon: List, zone: "left", activity: 1, render: () => <p>Outline view</p> },
        { id: "todos", title: "Todos", Icon: ListTodo, zone: "left", activity: 2, mobile: "tab", render: () => <p>Todos view</p> },
        { id: "chat", title: "Chat", Icon: Sparkles, zone: "right", mobile: "tab", render: () => <p>Chat view</p> },
        { id: "jobs", title: "Jobs", Icon: ListChecks, zone: "bottom", render: () => <p>Jobs view</p> },
        { id: "report", title: "Report", Icon: FileText, zone: "center", mobile: "more", render: () => <p>Report view</p> },
      ]),
      provideAll(rt.slots, menuItemsSlot, [
        menuItem(OpenSettings, {}, { id: "settings", menu: "File", label: "Settings…", shortcut: "Ctrl+," }),
        menuItem(OpenSettings, { section: "team" }, { id: "team", menu: "File", label: "Team settings", shortcut: "Del" }),
        menuItem(ShowPanel, { id: "report" }, { id: "report", menu: "View", label: "Report" }),
        menuItem(ApplyLayout, { id: "reading" }, { id: "reading", menu: "View", submenu: "Layout", label: "Reading" }),
      ]),
      registerAll(rt.slots, settingsTabsSlot, [
        { id: "me", label: "Me", group: "you", keywords: [], order: 1, render: () => <p>About me</p> },
        { id: "team", label: "Team", group: "admin", keywords: [], order: 2, render: () => <p>The team</p> },
      ]),
    ),
};

function renderShell(initialMode: Mode = "desktop") {
  const rt = createRuntime();
  contributeAll(rt, [fixture], { viewer: "admin", commander: { current: null } });
  render(
    <AppRuntimeContext.Provider value={rt}>
      <AppShell commanderRef={{ current: null }} initialMode={initialMode} />
    </AppRuntimeContext.Provider>,
  );
  return rt;
}

const tab = (title: string) =>
  screen.queryAllByText(title).find((el) => el.closest(".dv-tab")) as HTMLElement | undefined;
const groupOf = (el: HTMLElement | undefined) => el?.closest(".dv-groupview");
const activity = (name: string) =>
  within(screen.getByRole("navigation", { name: "Activity bar" })).getByRole("button", { name });
const closeTab = (title: string) => {
  const close = tab(title)?.closest(".dv-tab")?.querySelector(".dv-default-tab-action");
  fireEvent.pointerDown(close as Element);
  fireEvent.click(close as Element);
};
const settingsNav = () => screen.getByRole("navigation", { name: "Settings sections" });

describe("AppShell on a desktop", () => {
  it("lays the views out by zone: left views as tabs of one bar, then right, bottom; file panels in the center", () => {
    renderShell();
    expect(screen.getByText("Outline view")).toBeTruthy();
    expect(groupOf(tab("Outline"))).toBe(groupOf(tab("Todos")));
    expect(screen.getByText("Chat view")).toBeTruthy();
    expect(screen.getByText("Jobs view")).toBeTruthy();
    expect(groupOf(tab("clients"))).not.toBe(groupOf(tab("Outline")));
    expect(screen.queryByText("Report view")).toBeNull();
  });

  it("the activity bar switches the left view and collapses the bar", () => {
    renderShell();
    expect(activity("Outline").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(activity("Todos"));
    expect(activity("Todos").getAttribute("aria-pressed")).toBe("true");
    expect(activity("Outline").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("Todos view")).toBeTruthy();
    fireEvent.click(activity("Todos"));
    expect(activity("Todos").getAttribute("aria-pressed")).toBe("false");
  });

  it("the main menu runs the item's command", () => {
    renderShell();
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "View" }), { key: "Enter" });
    fireEvent.click(screen.getByRole("menuitem", { name: /^Report/ }));
    expect(screen.getByText("Report view")).toBeTruthy();
  });

  it("a center view opens beside the active file panel, and still opens when every file tab was closed", () => {
    const rt = renderShell();
    act(() => {
      rt.commands.call(ShowPanel, { id: "report" });
    });
    expect([groupOf(tab("clients")), groupOf(tab("2025"))]).toContain(groupOf(tab("Report")));
    closeTab("Report");
    closeTab("clients");
    closeTab("2025");
    act(() => {
      rt.commands.call(ShowPanel, { id: "report" });
    });
    expect(screen.getByText("Report view")).toBeTruthy();
    expect(groupOf(tab("Report"))).not.toBe(groupOf(tab("Outline")));
  });

  it("Ctrl+, opens Settings at the last section; a section that is not there opens the first", () => {
    const rt = renderShell();
    fireEvent.keyDown(document.body, { key: ",", ctrlKey: true });
    expect(screen.getByText("About me")).toBeTruthy();
    fireEvent.click(within(settingsNav()).getByRole("button", { name: "Team" }));
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(screen.queryByText("The team")).toBeNull();
    fireEvent.keyDown(document.body, { key: ",", ctrlKey: true });
    expect(screen.getByText("The team")).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    act(() => {
      rt.commands.call(OpenSettings, { section: "nowhere" });
    });
    expect(screen.getByText("About me")).toBeTruthy();
  });

  it("a shortcut typed into a text field stays in the field", () => {
    renderShell();
    const filter = screen.getAllByPlaceholderText("Filter by name")[0] as HTMLElement;
    fireEvent.keyDown(filter, { key: "Delete" });
    expect(screen.queryByRole("navigation", { name: "Settings sections" })).toBeNull();
    fireEvent.keyDown(document.body, { key: "Delete" });
    expect(screen.getByText("The team")).toBeTruthy();
  });
});

describe("AppShell on a tablet", () => {
  it("compact: side views open as overlays from the activity bar; Escape and the backdrop close them", () => {
    renderShell("compact");
    expect(screen.queryByText("Outline view")).toBeNull();
    expect(screen.getByText("Jobs view")).toBeTruthy();
    fireEvent.click(activity("Chat"));
    expect(within(screen.getByRole("complementary", { name: "Chat" })).getByText("Chat view")).toBeTruthy();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("complementary", { name: "Chat" })).toBeNull();
    fireEvent.click(activity("Outline"));
    fireEvent.click(screen.getByRole("button", { name: "Close panel" }));
    expect(screen.queryByRole("complementary", { name: "Outline" })).toBeNull();
  });
});

describe("AppShell on a phone", () => {
  it("one view at a time; More lists the rest; ☰ runs the same items", () => {
    renderShell("mobile");
    const views = screen.getByRole("navigation", { name: "Views" });
    expect(within(views).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Files",
      "Todos",
      "Chat",
      "More",
    ]);
    fireEvent.click(within(views).getByRole("button", { name: "Todos" }));
    expect(screen.getByText("Todos view")).toBeTruthy();
    fireEvent.click(within(views).getByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    expect(screen.getByText("Report view")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    fireEvent.click(screen.getByRole("button", { name: "File" }));
    fireEvent.click(screen.getByRole("button", { name: /^Settings…/ }));
    expect(screen.getByText("About me")).toBeTruthy();
  });

  it("phone: a file opens full screen and Back returns to its panel", async () => {
    renderShell("mobile");
    fireEvent.click(screen.getByRole("tab", { name: "2025" }));
    fireEvent.doubleClick(await screen.findByRole("row", { name: /backup\.zip/ }));
    expect(await screen.findByRole("region", { name: "Viewer: backup.zip" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("row", { name: /backup\.zip/ })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest --run test/app-shell.test.tsx`
Expected: FAIL — cannot resolve `../src/app/shell/app-shell.js`.

- [ ] **Step 3: Write `src/app/shell/app-dock.ts`**

```ts
// How the App's views go onto the dock. The file panels are placed by
// `useFilesInDock`; these functions place the App views around them.
import type { DockviewApi, IDockviewPanel } from "dockview-react";
import type { Zone } from "../../workspace-layout/zones.js";
import type { AppLayoutId, AppView } from "../contracts.js";

/** The dock component every App view renders through; it finds the view by panel id. */
export const VIEW = "app-view";
/** Each side zone's size when a mode is laid out from scratch. */
export const SIDE_SIZES = { left: 260, right: 360, bottom: 48 } as const;
/** Dockview's default minimum group height (100px) is too tall for the bottom strip. */
const STRIP_MIN_HEIGHT = 32;
const EDGE = { left: "left", right: "right", bottom: "below" } as const;

export const byActivity = (a: AppView, b: AppView) => (a.activity ?? 0) - (b.activity ?? 0);

export const zoneOfPanel = (panel: IDockviewPanel): Zone =>
  (panel.params as { zone?: Zone } | undefined)?.zone ?? "center";

const panelOf = (view: AppView) => ({
  id: view.id,
  title: view.title,
  component: VIEW,
  params: { zone: view.zone },
});

/**
 * The views a dock mode starts with: the activity views on the left, the
 * right and bottom views in the Assistant layout. Center views open on
 * demand; the compact mode keeps left and right views as overlays.
 */
export function startingViews(views: AppView[], layout: AppLayoutId, compact: boolean): AppView[] {
  return views.filter((v) => {
    if (v.zone === "left") return !compact && v.activity !== undefined;
    if (v.zone === "right") return !compact && layout === "assistant";
    if (v.zone === "bottom") return layout === "assistant";
    return false;
  });
}

/**
 * Adds the side zones around what the dock already holds (the file panels):
 * each zone's views as tabs of one group at that edge, the bottom one last so
 * it spans the full width; then the sizes, which dockview would rebalance if
 * set while zones are still being added.
 */
export function layoutSides(api: DockviewApi, views: AppView[]): void {
  const zones = ["left", "right", "bottom"] as const;
  for (const zone of zones) {
    const [first, ...rest] = views.filter((v) => v.zone === zone).sort(byActivity);
    if (!first) continue;
    api.addPanel({ ...panelOf(first), position: { direction: EDGE[zone] } });
    for (const v of rest) {
      api.addPanel({ ...panelOf(v), position: { referencePanel: first.id }, inactive: true });
    }
  }
  for (const zone of zones) {
    const first = views.filter((v) => v.zone === zone).sort(byActivity)[0];
    const group = first && api.getPanel(first.id)?.group.api;
    if (!group) continue;
    if (zone === "bottom") {
      group.setConstraints({ minimumHeight: STRIP_MIN_HEIGHT });
      group.setSize({ height: SIDE_SIZES.bottom });
    } else group.setSize({ width: SIDE_SIZES[zone] });
  }
}

/**
 * Opens `view`, or brings it forward where it is (a hidden group shows again).
 * A center view goes beside the active center panel; with no center panel
 * left, right of the left bar (or left of the right bar), never inside them.
 */
export function showView(api: DockviewApi, view: AppView): void {
  const open = api.getPanel(view.id);
  if (open) {
    open.group.api.setVisible(true);
    open.api.setActive();
    return;
  }
  const inZone = (zone: Zone) => api.panels.find((p) => zoneOfPanel(p) === zone);
  if (view.zone !== "center") {
    const near = inZone(view.zone);
    if (near) api.addPanel({ ...panelOf(view), position: { referencePanel: near.id } });
    else api.addPanel({ ...panelOf(view), position: { direction: EDGE[view.zone] } });
    return;
  }
  const active = api.activePanel;
  const center = active && zoneOfPanel(active) === "center" ? active : inZone("center");
  const left = inZone("left");
  const right = inZone("right");
  if (center) api.addPanel({ ...panelOf(view), position: { referencePanel: center.id } });
  else if (left) {
    api.addPanel({ ...panelOf(view), position: { referencePanel: left.id, direction: "right" } });
  } else if (right) {
    api.addPanel({ ...panelOf(view), position: { referencePanel: right.id, direction: "left" } });
  } else api.addPanel(panelOf(view));
}

/** On for the activity bar: in the left zone, the active tab of a visible group. */
export function isShownLeft(api: DockviewApi, id: string): boolean {
  const panel = api.getPanel(id);
  return (
    !!panel &&
    zoneOfPanel(panel) === "left" &&
    panel.group.api.isVisible &&
    panel.group.activePanel?.id === id
  );
}

/** The activity bar's click: hides the left bar when the view is already shown there. */
export function toggleLeft(api: DockviewApi, view: AppView): void {
  const panel = api.getPanel(view.id);
  if (panel && isShownLeft(api, view.id)) panel.group.api.setVisible(false);
  else showView(api, view);
}
```

- [ ] **Step 4: Write `src/app/shell/panel-page.tsx`**

```tsx
import type { ReactNode } from "react";

/** A page-shaped prototype (a card of limited width) inside a dock panel: centered, scrolling. */
export function PanelPage({ children }: { children: ReactNode }) {
  return <div className="grid min-h-full content-start justify-items-center p-4">{children}</div>;
}
```

- [ ] **Step 5: Write `src/app/shell/phone-stack.tsx`**

```tsx
import { Button, cn } from "@statewalker/ui.view.shadcn";
import { ArrowLeft, Ellipsis, Files } from "lucide-react";
import { useState } from "react";
import { CommanderPanel } from "../../file-panels/dock-files.js";
import { type Commander, ViewerBody } from "../../file-panels/use-commander.js";
import type { AppView, Icon } from "../contracts.js";

/** Files on a phone: the docked file panels with a tab row; an opened file fills the screen. */
function PhoneFiles({ commander }: { commander: Commander }) {
  const docked = commander.panels.filter((p) => p.dock !== false);
  const [id, setId] = useState(docked[0]?.id);
  const panel = docked.find((p) => p.id === id) ?? docked[0];
  const { viewer, setViewer } = commander;
  if (viewer) {
    const name = viewer.path.split("/").at(-1) ?? viewer.path;
    return (
      <section aria-label={`Viewer: ${name}`} className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center gap-1 border-b p-1">
          <Button size="sm" variant="ghost" onClick={() => setViewer(undefined)}>
            <ArrowLeft /> Back
          </Button>
          <span className="min-w-0 truncate text-sm">{name}</span>
        </div>
        <div className="min-h-0 flex-1">
          <ViewerBody viewer={viewer} />
        </div>
      </section>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      {docked.length > 1 && (
        <div role="tablist" className="flex shrink-0 gap-1 overflow-x-auto border-b px-2 py-1">
          {docked.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={p.id === panel?.id}
              onClick={() => setId(p.id)}
              className={cn(
                "rounded-md px-3 py-1 text-sm",
                p.id === panel?.id ? "bg-secondary font-medium" : "text-muted-foreground",
              )}
            >
              {commander.title(p.path)}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1">{panel && <CommanderPanel id={panel.id} />}</div>
    </div>
  );
}

/**
 * The phone: no dock; one view fills the screen. The bottom bar holds Files,
 * the views marked `mobile: "tab"`, and More, which lists the `"more"` ones.
 * `current` is "files", "more" or a view id; a view opened by a command shows
 * even when it is on neither bar.
 */
export function PhoneStack({
  views,
  current,
  onSelect,
  commander,
}: {
  views: AppView[];
  current: string;
  onSelect(id: string): void;
  commander: Commander;
}) {
  const tabs = views.filter((v) => v.mobile === "tab");
  const more = views.filter((v) => v.mobile === "more");
  const view = views.find((v) => v.id === current);
  const bar: { id: string; title: string; Icon: Icon }[] = [
    { id: "files", title: "Files", Icon: Files },
    ...tabs,
    ...(more.length ? [{ id: "more", title: "More", Icon: Ellipsis }] : []),
  ];
  const lit = view?.mobile === "more" ? "more" : current;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1">
        {current === "files" ? (
          <PhoneFiles commander={commander} />
        ) : current === "more" ? (
          <ul className="divide-y">
            {more.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => onSelect(v.id)}
                  className="hover:bg-accent flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm"
                >
                  <v.Icon className="size-4" />
                  {v.title}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="@container h-full overflow-auto">{view?.render()}</div>
        )}
      </div>
      <nav className="flex shrink-0 border-t" aria-label="Views">
        {bar.map(({ id, title, Icon }) => (
          <button
            key={id}
            type="button"
            aria-current={id === lit ? "page" : undefined}
            onClick={() => onSelect(id)}
            className={cn(
              "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs",
              id === lit ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <Icon className="size-5" />
            {title}
          </button>
        ))}
      </nav>
    </div>
  );
}
```

- [ ] **Step 6: Write `src/app/shell/app-shell.tsx`**

```tsx
import "dockview-react/dist/styles/dockview.css";
import "../../workspace-layout/workspace.css";
import { Button, cn } from "@statewalker/ui.view.shadcn";
import {
  type DockviewApi,
  DockviewReact,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
  type SerializedDockview,
} from "dockview-react";
import { Settings as SettingsIcon, X } from "lucide-react";
import { createContext, useContext, useEffect, useReducer, useRef, useState } from "react";
import {
  FilesInDock,
  fileContributions,
  fileDockComponents,
  fileTabComponents,
  useFilesInDock,
} from "../../file-panels/dock-files.js";
import { type Commander, useCommander } from "../../file-panels/use-commander.js";
import { SettingsDialog } from "../../settings/settings.js";
import { MissingPanel } from "../../workspace-layout/panels.js";
import { type Mode, modeFor, usesDock } from "../../workspace-layout/responsive.js";
import { keepSideSizes, loadSavedLayout, syncZones } from "../../workspace-layout/zones.js";
import {
  type AppLayoutId,
  type AppMenuItem,
  type AppTheme,
  type AppView,
  ApplyLayout,
  appViewsSlot,
  ClosePanel,
  headerItemsSlot,
  menuItemsSlot,
  OpenSettings,
  overlaysSlot,
  SetTheme,
  ShowPanel,
  settingsTabsSlot,
} from "../contracts.js";
import {
  all,
  handle,
  ThemeContext,
  useAppRuntime,
  useKeyedSlotValues,
  useSlotValues,
} from "../runtime.js";
import {
  byActivity,
  isShownLeft,
  layoutSides,
  showView,
  startingViews,
  toggleLeft,
  VIEW,
} from "./app-dock.js";
import { buildMenus, isTyping, matchesShortcut } from "./menu-model.js";
import { AppMenubar } from "./menubar.js";
import { PhoneMenu } from "./phone-menu.js";
import { PhoneStack } from "./phone-stack.js";

const MISSING = "missing";
// HTML5 drag and drop is unreliable on touch screens, so the dock does not offer it there.
const coarsePointer = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
/** What a saved layout may hold: App views and the file panels' own components. */
const KNOWN = [{ id: VIEW, title: "", component: VIEW, targets: [] }, ...fileContributions];
/** The file panels the App opens with: the Files tree (out of the dock) and two panels. */
const START_PANELS = [
  { path: "/documents", view: "tree" as const, dock: false as const },
  "/documents/clients",
  "/archive/2025",
];

const ViewsContext = createContext<ReadonlyMap<string, AppView>>(new Map());

/** Every App view on the dock sits in a size container: its content follows the panel's width. */
function ViewPanel({ api }: IDockviewPanelProps) {
  const view = useContext(ViewsContext).get(api.id);
  return <div className="@container h-full overflow-auto">{view?.render()}</div>;
}

const components = { [VIEW]: ViewPanel, ...fileDockComponents, [MISSING]: MissingPanel };

function ActivityBar({
  views,
  pressed,
  onToggle,
  onSettings,
}: {
  views: AppView[];
  pressed(id: string): boolean;
  onToggle(view: AppView): void;
  onSettings(): void;
}) {
  return (
    <nav
      aria-label="Activity bar"
      className="flex w-12 shrink-0 flex-col items-center gap-1 border-r py-2"
    >
      {views.map((v) => (
        <Button
          key={v.id}
          variant={pressed(v.id) ? "secondary" : "ghost"}
          size="icon"
          aria-label={v.title}
          aria-pressed={pressed(v.id)}
          title={v.title}
          onClick={() => onToggle(v)}
        >
          <v.Icon />
        </Button>
      ))}
      <div className="flex-1" />
      <Button variant="ghost" size="icon" aria-label="Settings" title="Settings" onClick={onSettings}>
        <SettingsIcon />
      </Button>
    </nav>
  );
}

export interface AppShellProps {
  /** Set to the shell's commander on each render, for the features' file commands. */
  commanderRef: { current: Commander | null };
  /** The mode before the shell has measured itself; it then follows its own width. */
  initialMode?: Mode;
}

/**
 * The App: menus and header items on top; on a desktop the activity bar and
 * the dock (file panels in the center, the views around them); on a tablet
 * the side views as overlays; on a phone one view at a time. Everything it
 * shows comes from the slots; it handles the dock, Settings, layout and theme
 * commands.
 */
export function AppShell({ commanderRef, initialMode = "desktop" }: AppShellProps) {
  const rt = useAppRuntime();
  const viewMap = useKeyedSlotValues(appViewsSlot);
  const views = [...viewMap.values()];
  const viewsRef = useRef(views);
  viewsRef.current = views;
  const menuItems = useSlotValues(menuItemsSlot);
  const itemsRef = useRef(menuItems);
  itemsRef.current = menuItems;
  const menus = buildMenus(menuItems);
  const header = [...useSlotValues(headerItemsSlot)].sort((a, b) => a.order - b.order);
  const overlays = useSlotValues(overlaysSlot);
  const tabs = [...useKeyedSlotValues(settingsTabsSlot).values()].sort((a, b) => a.order - b.order);

  const commander = useCommander({ panels: START_PANELS });
  commanderRef.current = commander;

  const root = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<Mode>(initialMode);
  const modeRef = useRef<Mode>(initialMode);
  const api = useRef<DockviewApi | null>(null);
  const [dockApi, setDockApi] = useState<DockviewApi | null>(null);
  const filesDock = useFilesInDock(commander, dockApi, { phone: coarsePointer });
  // Read through a ref: a re-layout must re-add the file panels the commander has now.
  const filesDockRef = useRef(filesDock);
  filesDockRef.current = filesDock;
  // The user's arrangement of each dock mode, kept while the screen changes size.
  const savedLayouts = useRef(new Map<Mode, SerializedDockview>());
  const arrangedFor = useRef<Mode | undefined>(undefined);
  const layoutId = useRef<AppLayoutId>("assistant");
  const disposers = useRef<Array<() => void>>([]);
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  const [overlay, setOverlay] = useState<string | null>(null);
  const [phoneView, setPhoneView] = useState("files");
  const [settings, setSettings] = useState<{ open: boolean; section?: string }>({ open: false });
  const lastSection = useRef<string | undefined>(undefined);
  const [theme, setTheme] = useState<AppTheme>("system");

  /** Lays the dock out for `target`: the arrangement saved for it, or from scratch. */
  const arrange = (target: Mode) => {
    const dock = api.current;
    if (!dock) return;
    const saved = savedLayouts.current.get(target);
    filesDockRef.current.relayout(() => {
      if (saved) loadSavedLayout(dock, saved, KNOWN, MISSING);
      else dock.clear();
    });
    if (!saved) {
      layoutSides(dock, startingViews(viewsRef.current, layoutId.current, target === "compact"));
    }
    arrangedFor.current = target;
    syncZones(dock, () => "hover");
    refresh();
  };

  const disposeDock = () => {
    for (const dispose of disposers.current) dispose();
    disposers.current = [];
  };

  const onReady = (event: DockviewReadyEvent) => {
    disposeDock();
    api.current = event.api;
    setDockApi(event.api);
    const subscriptions = [
      event.api.onDidLayoutChange(() => {
        syncZones(event.api, () => "hover");
        refresh();
      }),
      event.api.onDidActivePanelChange(() => refresh()),
    ];
    disposers.current.push(() => {
      for (const s of subscriptions) s.dispose();
    });
    arrange(modeRef.current);
    disposers.current.push(keepSideSizes(event.api));
  };

  const switchMode = (next: Mode) => {
    const previous = modeRef.current;
    if (next === previous) return;
    // Saved before the dock may unmount (the phone has no dock).
    if (api.current && usesDock(previous)) savedLayouts.current.set(previous, api.current.toJSON());
    if (!usesDock(next)) {
      disposeDock();
      api.current = null;
      setDockApi(null);
      arrangedFor.current = undefined;
    }
    modeRef.current = next;
    setOverlay(null);
    setMode(next);
  };

  // The shell follows its own width, not the viewport's.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? 0;
      if (width > 0) switchMode(modeFor(width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Desktop ↔ compact keeps the same dock (no remount): lay it out for the new mode.
  useEffect(() => {
    if (usesDock(mode) && api.current && arrangedFor.current !== mode) arrange(mode);
  }, [mode]);

  useEffect(() => disposeDock, []);

  // "System" leaves the page's own theme alone; light and dark set it while the App is shown.
  useEffect(() => {
    if (theme === "system") return;
    const el = document.documentElement;
    const before = el.classList.contains("dark");
    el.classList.toggle("dark", theme === "dark");
    return () => {
      el.classList.toggle("dark", before);
    };
  }, [theme]);

  const show = (id: string) => {
    const view = viewsRef.current.find((v) => v.id === id);
    if (!view) return;
    const current = modeRef.current;
    if (current === "mobile") setPhoneView(id);
    else if (current === "compact" && (view.zone === "left" || view.zone === "right")) {
      setOverlay(id);
    } else if (api.current) {
      showView(api.current, view);
      refresh();
    }
  };

  const openSettings = (section?: string) => {
    const target = section ?? lastSection.current;
    lastSection.current = target;
    setSettings({ open: true, section: target });
  };

  useEffect(
    () =>
      all(
        handle(rt, ShowPanel, ({ id }) => show(id)),
        handle(rt, ClosePanel, ({ id }) => {
          const dock = api.current;
          const panel = dock && (id ? dock.getPanel(id) : dock.activePanel);
          if (dock && panel) dock.removePanel(panel);
        }),
        handle(rt, OpenSettings, ({ section }) => openSettings(section)),
        handle(rt, ApplyLayout, ({ id }) => {
          layoutId.current = id;
          const current = modeRef.current;
          if (!usesDock(current)) return;
          savedLayouts.current.delete(current);
          arrange(current);
        }),
        handle(rt, SetTheme, ({ theme }) => setTheme(theme)),
      ),
    [rt],
  );

  // Menu shortcuts. A key a panel or a text field already handled is theirs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTyping(e)) return;
      const item = itemsRef.current.find((i) => i.shortcut && matchesShortcut(i.shortcut, e));
      if (!item) return;
      e.preventDefault();
      item.run(rt.commands);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rt]);

  // A compact overlay closes on Escape.
  useEffect(() => {
    if (!overlay) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOverlay(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlay]);

  const run = (item: AppMenuItem) => item.run(rt.commands);
  const activityViews = views.filter((v) => v.zone === "left" && v.activity !== undefined);
  const barViews = (
    mode === "compact" ? [...activityViews, ...views.filter((v) => v.zone === "right")] : activityViews
  ).sort(byActivity);
  const pressed = (id: string) =>
    mode === "compact" ? overlay === id : !!dockApi && isShownLeft(dockApi, id);
  const toggle = (view: AppView) => {
    if (mode === "compact") setOverlay(overlay === view.id ? null : view.id);
    else if (api.current) {
      toggleLeft(api.current, view);
      refresh();
    }
  };
  const overlayView = views.find((v) => v.id === overlay);
  const phoneTitle =
    phoneView === "files"
      ? "Files"
      : phoneView === "more"
        ? "More"
        : (views.find((v) => v.id === phoneView)?.title ?? "");

  return (
    <ThemeContext.Provider value={theme}>
      <ViewsContext.Provider value={viewMap}>
        <FilesInDock.Provider value={filesDock}>
          <div
            ref={root}
            data-mode={mode}
            className="bg-background text-foreground relative flex h-full min-h-0 flex-col"
          >
            <header className="flex h-10 shrink-0 items-center gap-2 border-b px-2">
              {mode === "mobile" ? (
                <>
                  <PhoneMenu menus={menus} onRun={run} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{phoneTitle}</span>
                </>
              ) : (
                <>
                  <AppMenubar menus={menus} onRun={run} />
                  <span className="flex-1" />
                </>
              )}
              {header.map(({ id, Component }) => (
                <Component key={id} />
              ))}
            </header>
            {mode === "mobile" ? (
              <PhoneStack
                views={views}
                current={phoneView}
                onSelect={setPhoneView}
                commander={commander}
              />
            ) : (
              <div className="flex min-h-0 flex-1">
                <ActivityBar
                  views={barViews}
                  pressed={pressed}
                  onToggle={toggle}
                  onSettings={() => openSettings()}
                />
                <div className="relative min-h-0 min-w-0 flex-1">
                  <DockviewReact
                    className="dockview-theme-light dockview-theme-sandclaw absolute inset-0"
                    components={components}
                    tabComponents={fileTabComponents}
                    onReady={onReady}
                    disableDnd={coarsePointer}
                    disableFloatingGroups
                  />
                  {overlayView && (
                    <>
                      <button
                        type="button"
                        aria-label="Close panel"
                        className="absolute inset-0 z-10 bg-black/20"
                        onClick={() => setOverlay(null)}
                      />
                      <aside
                        aria-label={overlayView.title}
                        className={cn(
                          "bg-background absolute inset-y-0 z-20 flex w-[min(360px,85%)] flex-col shadow-xl",
                          overlayView.zone === "right" ? "right-0 border-l" : "left-0 border-r",
                        )}
                      >
                        <div className="flex h-10 shrink-0 items-center justify-between border-b px-3 text-sm font-medium">
                          {overlayView.title}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Close"
                            onClick={() => setOverlay(null)}
                          >
                            <X />
                          </Button>
                        </div>
                        <div className="@container min-h-0 flex-1 overflow-auto">
                          {overlayView.render()}
                        </div>
                      </aside>
                    </>
                  )}
                </div>
              </div>
            )}
            {commander.noticeBar}
            {commander.progressStrip}
            {commander.dialogs}
            <SettingsDialog
              open={settings.open}
              onOpenChange={(open) => setSettings((s) => ({ ...s, open }))}
              entries={tabs}
              section={settings.section}
              onSectionChange={(id) => {
                lastSection.current = id;
              }}
              phone={mode === "mobile"}
            />
            {overlays.map(({ id, Component }) => (
              <Component key={id} />
            ))}
          </div>
        </FilesInDock.Provider>
      </ViewsContext.Provider>
    </ThemeContext.Provider>
  );
}
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `pnpm vitest --run test/app-shell.test.tsx`
Expected: 9 passed. Two things to check if one fails:
- *"Escape" does not close the Settings dialog in the Ctrl+, test*: send it to the dialog itself: `fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })`.
- *The collapse in the activity-bar test does not flip `aria-pressed`*: dockview may report `isVisible` only after its layout pass; read visibility from `panel.group.api.isVisible` after `refresh()` — the shell already calls `refresh()` after `toggleLeft`; if it still fails, track the collapsed state in the shell (`useState<boolean>` for the left bar, set in `toggle`, cleared by `showView` calls) and report it.

- [ ] **Step 8: Full checks** — as Task 1 Step 7. Biome may flag the `useEffect` dependency lists; match how `src/workspace-layout/workspace.tsx` passes the same rule (it uses the same patterns), without adding suppressions it does not use.

- [ ] **Step 9: Commit**

```bash
git add apps/ui-protos.app/src/app/shell apps/ui-protos.app/test/app-shell.test.tsx
git commit -F - <<'EOF'
feat(ui-protos.app): the App shell — activity bar, dock, overlays, phone stack, Settings host

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013q49VfKpaNy7AsN3rNRbUz
EOF
```

---

### Task 5: Features and the App

**Files:**
- Modify: `apps/ui-protos.app/src/notifications/notifications.tsx` (embedded bell)
- Modify: `apps/ui-protos.app/src/conversations/conversations.tsx:491-519` (fill)
- Modify: `apps/ui-protos.app/src/workspace-layout/workspace.tsx:58` (export `FolderBar`)
- Create: `apps/ui-protos.app/src/app/features/core.tsx`, `files.tsx`, `todos.tsx`, `sites.tsx`, `indexing.tsx`, `assistant.tsx`, `activity.tsx`, `mesh.tsx`
- Create: `apps/ui-protos.app/src/app/app.tsx`
- Test: `apps/ui-protos.app/test/app.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–4; existing components: `Appearance` (+`onChange`), `FolderBar`, `TodosView`, `Sites`, `IndexingTree`, `IndexExplorer`, `AssistantPanel`, `ConversationsSidebar` (+`fill`), `AnswerWithHow`, `dupontStart` (`ask/answers.ts`), `TasksStrip`, `Notifications` (+`embedded`), `history` (`notifications/notices-mock.ts`), `TeamOneList`, `MyIdentityPage`, `InvitationsLog`, `GroupPill`, `UnlockScreen`, `DemoStorageSettings`, `sections` (`settings-model.ts`).
- Produces: `allFeatures: Feature[]` (ids `core`, `files`, `todos`, `sites`, `indexing`, `assistant`, `activity`, `mesh`), `App({ viewer?, features?, initialMode?, runtime? })`.

- [ ] **Step 1: Write the failing tests**

`apps/ui-protos.app/test/app.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App, allFeatures } from "../src/app/app.js";
import { appViewsSlot, menuItemsSlot, settingsTabsSlot } from "../src/app/contracts.js";
import { createRuntime } from "../src/app/runtime.js";

afterEach(cleanup);

function renderApp(props: Parameters<typeof App>[0] = {}) {
  const runtime = createRuntime();
  render(<App runtime={runtime} {...props} />);
  return runtime;
}
const labels = (rt: ReturnType<typeof createRuntime>) =>
  rt.slots.getSnapshot(menuItemsSlot).map((i) => i.label);

describe("App", () => {
  it("every menu item names a command some handler answers", () => {
    const rt = renderApp();
    const handled = new Set(rt.handled.list().map((d) => d.key));
    const unanswered = rt.slots
      .getSnapshot(menuItemsSlot)
      .filter((i) => !handled.has(i.command))
      .map((i) => `${i.menu} › ${i.label} (${i.command})`);
    expect(unanswered).toEqual([]);
  });

  it("Claire's menus and Settings include the admin items; Hugo's don't", () => {
    const admin = renderApp();
    expect(labels(admin)).toContain("AI models…");
    expect([...admin.slots.getSnapshot(settingsTabsSlot).keys()]).toContain("team");
    cleanup();
    const member = renderApp({ viewer: "member" });
    expect(labels(member)).not.toContain("AI models…");
    expect(labels(member)).not.toContain("Invitations log");
    expect([...member.slots.getSnapshot(settingsTabsSlot).keys()]).not.toContain("team");
  });

  it("a feature switched off leaves no view, menu item or settings section behind", () => {
    const rt = renderApp({
      features: allFeatures.map((f) => f.id).filter((id) => id !== "sites" && id !== "indexing"),
    });
    expect(rt.slots.getSnapshot(appViewsSlot).has("sites")).toBe(false);
    expect(labels(rt)).not.toContain("Sites");
    expect(labels(rt)).not.toContain("Find in files…");
    expect([...rt.slots.getSnapshot(settingsTabsSlot).keys()]).not.toContain("indexing");
    const bar = screen.getByRole("navigation", { name: "Activity bar" });
    expect(within(bar).queryByRole("button", { name: "Sites" })).toBeNull();
  });

  it("on a desktop the real views sit in their zones, with the bell and Claire's avatar on top", () => {
    renderApp();
    expect(screen.getByRole("treegrid", { name: "Contents of /documents" })).toBeTruthy();
    expect(screen.getByPlaceholderText("Ask about your folder…")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Notifications/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Claire Morel" })).toBeTruthy();
  });

  it("Edit › Rename acts on the active file panel's selection", async () => {
    renderApp();
    // A press in a panel makes it the active one; the click selects the row.
    const row = await screen.findByRole("row", { name: /backup\.zip/ });
    fireEvent.mouseDown(row);
    fireEvent.click(row);
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "Edit" }), { key: "Enter" });
    fireEvent.click(screen.getByRole("menuitem", { name: /^Rename/ }));
    expect(await screen.findByRole("dialog", { name: "Rename backup.zip" })).toBeTruthy();
  });

  it("File › Lock covers the App until the password is typed", () => {
    renderApp();
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "File" }), { key: "Enter" });
    fireEvent.click(screen.getByRole("menuitem", { name: /^Lock/ }));
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    expect(screen.queryByLabelText("Password")).toBeNull();
  });

  it("choosing Dark in Settings › Appearance darkens the App at once", () => {
    renderApp();
    fireEvent.keyDown(document.body, { key: ",", ctrlKey: true });
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Settings sections" })).getByRole("button", {
        name: "Appearance",
      }),
    );
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    cleanup();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest --run test/app.test.tsx`
Expected: FAIL — cannot resolve `../src/app/app.js`.

- [ ] **Step 3: An embedded bell in `notifications.tsx`**

Add to `NotificationsProps`:

```ts
  /** Only the bell and its dropdown, for an app's own top bar (no stand-in app area, no toasts). */
  embedded?: boolean;
```

Destructure `embedded = false` in `Notifications`. Move the bell `<Button ref={bellRef} … </Button>` out of the `<header>` into `const bell = ( … );` above the `return`, and use `{bell}` in the header where it was. Then, right before the existing `return (`, add:

```tsx
  if (embedded) {
    return (
      <div className="relative">
        {bell}
        {open && (
          <div
            ref={popRef}
            role="dialog"
            aria-label="Notifications"
            className="bg-popover absolute top-full right-0 z-30 mt-1 flex max-h-[480px] w-[min(24rem,calc(100vw-1rem))] flex-col rounded-md border shadow-lg"
          >
            {list}
          </div>
        )}
      </div>
    );
  }
```

- [ ] **Step 4: `fill` for Conversations**

In `src/conversations/conversations.tsx`, add to `ConversationsProps`:

```ts
  /** Fill the parent (a dock tab) instead of the story's 640 px card. */
  fill?: boolean;
```

and in `ConversationsSidebar` replace the `Card` className with:

```tsx
      className={cn(
        "grid w-full grid-rows-[minmax(0,14rem)_minmax(0,1fr)] gap-0 overflow-hidden p-0 md:grid-cols-[16rem_minmax(0,1fr)] md:grid-rows-1",
        props.fill ? "h-full rounded-none border-0 shadow-none" : "h-[640px] max-h-[90svh] max-w-4xl",
      )}
```

(`cn` is already imported there; if not, import it from `@statewalker/ui.view.shadcn`.)

- [ ] **Step 5: Export `FolderBar`**

In `src/workspace-layout/workspace.tsx` change `function FolderBar()` to `export function FolderBar()`.

- [ ] **Step 6: Shared helpers for features — add to `src/app/runtime.ts`**

```ts
import { type SectionId, sections } from "../settings/settings-model.js";
import { type SettingsTab, settingsTabsSlot } from "./contracts.js";

/** A Settings section from the existing model (its label, group and keywords), rendering `render`. */
export function settingsTab(
  slots: Slots,
  id: SectionId,
  order: number,
  render: SettingsTab["render"],
): () => void {
  const info = sections.find((s) => s.id === id);
  if (!info) throw new Error(`No settings section "${id}"`);
  return slots.register(settingsTabsSlot, id, { ...info, order, render });
}
```

(Merge the imports with the existing ones at the top of the file.)

- [ ] **Step 7: Write the features**

`src/app/features/core.tsx`:

```tsx
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@statewalker/ui.view.shadcn";
import { Info, Keyboard, Settings } from "lucide-react";
import { useContext } from "react";
import { Appearance } from "../../settings/appearance.js";
import {
  ApplyLayout,
  menuItem,
  menuItemsSlot,
  OpenSettings,
  overlaysSlot,
  SetTheme,
  ShowAbout,
  ShowShortcuts,
} from "../contracts.js";
import {
  all,
  createStore,
  type Feature,
  handle,
  provideAll,
  settingsTab,
  ThemeContext,
  useAppRuntime,
  useSlotValues,
  useStore,
} from "../runtime.js";

function AppearanceTab() {
  const { commands } = useAppRuntime();
  const theme = useContext(ThemeContext);
  return (
    <Appearance
      value={{ theme, textSize: "default", density: "comfortable" }}
      onChange={(v) => {
        commands.call(SetTheme, { theme: v.theme });
      }}
    />
  );
}

/** Help › Keyboard shortcuts: every menu item that has one, from the menu-items slot. */
function Shortcuts() {
  const items = useSlotValues(menuItemsSlot).filter((i) => i.shortcut);
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-sm">
      {items.map((i) => (
        <div key={i.id} className="contents">
          <dt>
            {i.menu} › {i.label}
          </dt>
          <dd className="text-muted-foreground font-mono text-xs">{i.shortcut}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Layouts, theme, Settings…, Appearance, and Help. */
export const core: Feature = {
  id: "core",
  label: "Core",
  contribute(rt) {
    const dialog = createStore<"shortcuts" | "about" | null>(null);
    function HelpDialogs() {
      const open = useStore(dialog);
      return (
        <Dialog open={open !== null} onOpenChange={(o) => !o && dialog.set(null)}>
          <DialogContent>
            <DialogTitle>{open === "about" ? "About Sandclaw" : "Keyboard shortcuts"}</DialogTitle>
            <DialogDescription>
              {open === "about"
                ? "An assistant over your folder, shared with your group. Prototype build."
                : "The keys that run menu commands."}
            </DialogDescription>
            {open === "shortcuts" && <Shortcuts />}
          </DialogContent>
        </Dialog>
      );
    }
    return all(
      provideAll(rt.slots, menuItemsSlot, [
        menuItem(OpenSettings, {}, { id: "file.settings", menu: "File", order: 80, label: "Settings…", Icon: Settings, shortcut: "Ctrl+," }),
        menuItem(ApplyLayout, { id: "assistant" }, { id: "view.layout.assistant", menu: "View", order: 80, submenu: "Layout", label: "Assistant" }),
        menuItem(ApplyLayout, { id: "reading" }, { id: "view.layout.reading", menu: "View", order: 81, submenu: "Layout", label: "Reading" }),
        menuItem(SetTheme, { theme: "light" }, { id: "view.theme.light", menu: "View", order: 90, submenu: "Theme", label: "Light" }),
        menuItem(SetTheme, { theme: "dark" }, { id: "view.theme.dark", menu: "View", order: 91, submenu: "Theme", label: "Dark" }),
        menuItem(SetTheme, { theme: "system" }, { id: "view.theme.system", menu: "View", order: 92, submenu: "Theme", label: "System" }),
        menuItem(ShowShortcuts, undefined, { id: "help.shortcuts", menu: "Help", order: 10, label: "Keyboard shortcuts", Icon: Keyboard }),
        menuItem(ShowAbout, undefined, { id: "help.about", menu: "Help", order: 20, label: "About Sandclaw", Icon: Info }),
      ]),
      settingsTab(rt.slots, "appearance", 20, () => <AppearanceTab />),
      handle(rt, ShowShortcuts, () => dialog.set("shortcuts")),
      handle(rt, ShowAbout, () => dialog.set("about")),
      rt.slots.provide(overlaysSlot, { id: "help-dialogs", Component: HelpDialogs }),
    );
  },
};
```

`src/app/features/files.tsx`:

```tsx
import { ClipboardCopy, FilePen, FilePlus, FolderPlus, FolderTree, Scissors, Trash2, X } from "lucide-react";
import { DemoStorageSettings } from "../../file-mounts/demo-storage-settings.js";
import { FolderBar } from "../../workspace-layout/workspace.js";
import {
  appViewsSlot,
  ClosePanel,
  menuItem,
  menuItemsSlot,
  NewFilePanel,
  OpenSettings,
  RunFileCommand,
  ShowPanel,
} from "../contracts.js";
import { all, type Feature, handle, provideAll, settingsTab } from "../runtime.js";

/** The Files tree, the file commands on the active panel, and Settings › Storages. */
export const files: Feature = {
  id: "files",
  label: "Files",
  contribute(rt, ctx) {
    const active = () => {
      const c = ctx.commander.current;
      const panel = c?.panels.find((p) => p.id === c.activeId);
      return c && panel ? { c, panel } : undefined;
    };
    return all(
      rt.slots.register(appViewsSlot, "files-tree", {
        id: "files-tree",
        title: "Files",
        Icon: FolderTree,
        zone: "left",
        activity: 10,
        render: () => <FolderBar />,
      }),
      provideAll(rt.slots, menuItemsSlot, [
        menuItem(NewFilePanel, undefined, { id: "file.new-panel", menu: "File", order: 10, label: "New file panel", Icon: FilePlus }),
        menuItem(RunFileCommand, { command: "new-note" }, { id: "file.new-note", menu: "File", order: 20, label: "New note", Icon: FilePen }),
        menuItem(ClosePanel, {}, { id: "file.close-tab", menu: "File", order: 70, label: "Close tab", Icon: X }),
        menuItem(OpenSettings, { section: "storages" }, { id: "file.storages", menu: "File", order: 75, label: "Storages…" }),
        menuItem(RunFileCommand, { command: "copy" }, { id: "edit.copy", menu: "Edit", order: 10, label: "Copy to other panel", Icon: ClipboardCopy, shortcut: "F5" }),
        menuItem(RunFileCommand, { command: "move" }, { id: "edit.move", menu: "Edit", order: 20, label: "Move", Icon: Scissors, shortcut: "F6" }),
        menuItem(RunFileCommand, { command: "rename" }, { id: "edit.rename", menu: "Edit", order: 30, label: "Rename", shortcut: "F2" }),
        menuItem(RunFileCommand, { command: "mkdir" }, { id: "edit.mkdir", menu: "Edit", order: 40, label: "New folder", Icon: FolderPlus, shortcut: "F7" }),
        menuItem(RunFileCommand, { command: "delete" }, { id: "edit.delete", menu: "Edit", order: 50, label: "Delete", Icon: Trash2, shortcut: "Del" }),
        menuItem(ShowPanel, { id: "files-tree" }, { id: "go.file", menu: "Go", order: 10, label: "Go to file…", Icon: FolderTree }),
      ]),
      settingsTab(rt.slots, "storages", 35, () => <DemoStorageSettings vault="unlocked" />),
      handle(rt, NewFilePanel, () => {
        const a = active();
        ctx.commander.current?.addPanel(a?.panel.path ?? "/");
      }),
      handle(rt, RunFileCommand, ({ command }) => {
        const a = active();
        if (!a) return;
        a.c.panelProps(a.panel).onCommand?.(command, { path: a.panel.path, selected: a.panel.selected });
      }),
    );
  },
};
```

`src/app/features/todos.tsx`:

```tsx
import { ListTodo } from "lucide-react";
import { TodosView } from "../../notes-todos/todos-view.js";
import { appViewsSlot, menuItem, menuItemsSlot, ShowPanel } from "../contracts.js";
import { all, type Feature } from "../runtime.js";

export const todos: Feature = {
  id: "todos",
  label: "Todos",
  contribute: (rt) =>
    all(
      rt.slots.register(appViewsSlot, "todos", {
        id: "todos",
        title: "Todos",
        Icon: ListTodo,
        zone: "left",
        activity: 20,
        mobile: "tab",
        render: () => <TodosView />,
      }),
      rt.slots.provide(
        menuItemsSlot,
        menuItem(ShowPanel, { id: "todos" }, { id: "view.todos", menu: "View", order: 20, label: "Todos", Icon: ListTodo }),
      ),
    ),
};
```

`src/app/features/sites.tsx`:

```tsx
import { Globe } from "lucide-react";
import { Sites } from "../../sites/sites.js";
import { appViewsSlot, menuItem, menuItemsSlot, ShowPanel } from "../contracts.js";
import { all, type Feature } from "../runtime.js";

export const sites: Feature = {
  id: "sites",
  label: "Sites",
  contribute: (rt) =>
    all(
      rt.slots.register(appViewsSlot, "sites", {
        id: "sites",
        title: "Sites",
        Icon: Globe,
        zone: "left",
        activity: 30,
        mobile: "more",
        render: () => <Sites layout="rows" />,
      }),
      rt.slots.provide(
        menuItemsSlot,
        menuItem(ShowPanel, { id: "sites" }, { id: "view.sites", menu: "View", order: 30, label: "Sites", Icon: Globe }),
      ),
    ),
};
```

`src/app/features/indexing.tsx`:

```tsx
import { FileSearch, Search } from "lucide-react";
import { IndexExplorer } from "../../explore/explore.js";
import { IndexingPage, IndexingTree } from "../../indexing/indexing.js";
import { appViewsSlot, menuItem, menuItemsSlot, ShowPanel } from "../contracts.js";
import { all, type Feature, provideAll, registerAll, settingsTab } from "../runtime.js";
import { PanelPage } from "../shell/panel-page.js";

export const indexing: Feature = {
  id: "indexing",
  label: "Indexing and search",
  contribute: (rt) =>
    all(
      registerAll(rt.slots, appViewsSlot, [
        { id: "indexing", title: "Indexing", Icon: FileSearch, zone: "left", activity: 40, mobile: "more", render: () => <IndexingTree /> },
        { id: "explore", title: "Explore the indexes", Icon: Search, zone: "center", mobile: "more", render: () => <PanelPage><IndexExplorer /></PanelPage> },
      ]),
      provideAll(rt.slots, menuItemsSlot, [
        menuItem(ShowPanel, { id: "indexing" }, { id: "view.indexing", menu: "View", order: 40, label: "Indexing", Icon: FileSearch }),
        menuItem(ShowPanel, { id: "explore" }, { id: "edit.find", menu: "Edit", order: 60, label: "Find in files…", Icon: Search }),
      ]),
      settingsTab(rt.slots, "indexing", 80, () => <IndexingPage />),
    ),
};
```

`src/app/features/assistant.tsx`:

```tsx
import { Lightbulb, MessagesSquare, Sparkles } from "lucide-react";
import { AgentTools } from "../../agent-tools/agent-tools.js";
import { AiModels } from "../../ai-models/ai-models.js";
import { dupontStart } from "../../ask/answers.js";
import { AssistantPanel } from "../../assistant-panel/assistant-panel.js";
import { Connectors } from "../../connectors/connectors.js";
import { ConversationsSidebar } from "../../conversations/conversations.js";
import { AnswerWithHow } from "../../explore/how-answered.js";
import { appViewsSlot, menuItem, menuItemsSlot, OpenSettings, ShowPanel } from "../contracts.js";
import { all, type Feature, provideAll, registerAll, settingsTab } from "../runtime.js";
import { PanelPage } from "../shell/panel-page.js";

export const assistant: Feature = {
  id: "assistant",
  label: "Assistant",
  contribute: (rt, ctx) =>
    all(
      registerAll(rt.slots, appViewsSlot, [
        { id: "assistant", title: "Assistant", Icon: Sparkles, zone: "right", mobile: "tab", render: () => <AssistantPanel scenario="deck" /> },
        { id: "conversations", title: "Conversations", Icon: MessagesSquare, zone: "center", mobile: "more", render: () => <ConversationsSidebar fill /> },
        { id: "how-answered", title: "How it was answered", Icon: Lightbulb, zone: "center", render: () => <PanelPage><AnswerWithHow answer={dupontStart} /></PanelPage> },
      ]),
      provideAll(rt.slots, menuItemsSlot, [
        menuItem(ShowPanel, { id: "assistant" }, { id: "assistant.panel", menu: "Assistant", order: 10, label: "Assistant", Icon: Sparkles }),
        menuItem(ShowPanel, { id: "conversations" }, { id: "assistant.conversations", menu: "Assistant", order: 20, label: "Conversations", Icon: MessagesSquare }),
        menuItem(ShowPanel, { id: "how-answered" }, { id: "assistant.how", menu: "Assistant", order: 30, label: "How it was answered", Icon: Lightbulb }),
        menuItem(OpenSettings, { section: "agent-tools" }, { id: "assistant.tools", menu: "Assistant", order: 40, label: "Agent tools…" }),
        menuItem(OpenSettings, { section: "connectors" }, { id: "assistant.connectors", menu: "Assistant", order: 50, label: "Connectors…" }),
        ...(ctx.viewer === "admin"
          ? [menuItem(OpenSettings, { section: "ai-models" }, { id: "assistant.models", menu: "Assistant", order: 60, label: "AI models…" })]
          : []),
        menuItem(ShowPanel, { id: "assistant" }, { id: "view.assistant", menu: "View", order: 50, label: "Assistant", Icon: Sparkles }),
      ]),
      settingsTab(rt.slots, "connectors", 40, () => <Connectors variant="list" />),
      settingsTab(rt.slots, "agent-tools", 50, () => <AgentTools variant="groups" />),
      ctx.viewer === "admin"
        ? settingsTab(rt.slots, "ai-models", 110, () => <AiModels variant="one-page" />)
        : () => {},
    ),
};
```

`src/app/features/activity.tsx`:

```tsx
import { Card } from "@statewalker/ui.view.shadcn";
import { ListChecks } from "lucide-react";
import { NotificationSettings } from "../../notifications/notification-settings.js";
import { history } from "../../notifications/notices-mock.js";
import { Notifications } from "../../notifications/notifications.js";
import { TasksStrip } from "../../tasks/tasks-strip.js";
import { appViewsSlot, headerItemsSlot, menuItem, menuItemsSlot, ShowPanel } from "../contracts.js";
import { all, type Feature, settingsTab } from "../runtime.js";

/** What runs and what happened: the Tasks strip at the bottom, the bell on top. */
export const activity: Feature = {
  id: "activity",
  label: "Tasks and notifications",
  contribute: (rt, ctx) =>
    all(
      rt.slots.register(appViewsSlot, "tasks", {
        id: "tasks",
        title: "Tasks",
        Icon: ListChecks,
        zone: "bottom",
        mobile: "tab",
        render: () => <TasksStrip scenario="everything" />,
      }),
      rt.slots.provide(headerItemsSlot, {
        id: "bell",
        order: 20,
        Component: () => <Notifications embedded viewer={ctx.viewer} notices={history} />,
      }),
      rt.slots.provide(
        menuItemsSlot,
        menuItem(ShowPanel, { id: "tasks" }, { id: "view.tasks", menu: "View", order: 60, label: "Tasks", Icon: ListChecks }),
      ),
      settingsTab(rt.slots, "notifications", 30, () => (
        <Card className="w-full max-w-2xl gap-0 py-0">
          <h2 className="border-b p-4 font-semibold">Notifications</h2>
          <NotificationSettings viewer={ctx.viewer} />
        </Card>
      )),
    ),
};
```

`src/app/features/mesh.tsx`:

```tsx
import { Avatar, AvatarFallback } from "@statewalker/ui.view.shadcn";
import { Lock as LockIcon, Mail, Settings, Smartphone, UserRound, Users } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { BrowserData } from "../../browser-data/browser-data.js";
import { GroupPill } from "../../group-status/group-status.js";
import { InvitationsLog } from "../../invitations-log/invitations-log.js";
import { MyIdentityPage, UnlockScreen } from "../../my-identity/my-identity.js";
import { Services } from "../../services/services.js";
import { TeamOneList } from "../../team/team.js";
import {
  appViewsSlot,
  headerItemsSlot,
  Lock,
  menuItem,
  menuItemsSlot,
  OpenSettings,
  overlaysSlot,
  ShowPanel,
} from "../contracts.js";
import {
  all,
  createStore,
  type Feature,
  handle,
  provideAll,
  registerAll,
  settingsTab,
  useAppRuntime,
  useStore,
} from "../runtime.js";
import { menuContentClass, menuRowClass } from "../shell/menubar.js";
import { PanelPage } from "../shell/panel-page.js";

const PEOPLE = { admin: "Claire Morel", member: "Hugo Benali" } as const;

/** The group, its people and this device: Team, identity, invitations, the pill, the avatar, the lock. */
export const mesh: Feature = {
  id: "mesh",
  label: "Mesh",
  contribute(rt, ctx) {
    const admin = ctx.viewer === "admin";
    const name = PEOPLE[ctx.viewer];
    const locked = createStore(false);

    function AvatarMenu() {
      const { commands } = useAppRuntime();
      const initials = name
        .split(" ")
        .map((w) => w[0])
        .join("");
      return (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button type="button" aria-label={name} className="rounded-full">
              <Avatar className="size-7">
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={4} className={menuContentClass}>
              <DropdownMenu.Item className={menuRowClass} onSelect={() => commands.call(ShowPanel, { id: "my-identity" })}>
                <UserRound className="size-4" /> My identity and devices
              </DropdownMenu.Item>
              <DropdownMenu.Item className={menuRowClass} onSelect={() => commands.call(OpenSettings, {})}>
                <Settings className="size-4" /> Settings
              </DropdownMenu.Item>
              <DropdownMenu.Item className={menuRowClass} onSelect={() => commands.call(Lock, undefined)}>
                <LockIcon className="size-4" /> Lock
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      );
    }

    function LockScreen() {
      if (!useStore(locked)) return null;
      return (
        <div className="bg-background absolute inset-0 z-50 grid place-items-center p-4">
          <UnlockScreen onUnlock={() => locked.set(false)} />
        </div>
      );
    }

    return all(
      registerAll(rt.slots, appViewsSlot, [
        { id: "team", title: "Team", Icon: Users, zone: "left", activity: 50, mobile: "more", render: () => <PanelPage><TeamOneList viewer={ctx.viewer} /></PanelPage> },
        { id: "my-identity", title: "My identity and devices", Icon: UserRound, zone: "center", render: () => <PanelPage><MyIdentityPage /></PanelPage> },
        ...(admin
          ? [{ id: "invitations-log", title: "Invitations log", Icon: Mail, zone: "center" as const, render: () => <PanelPage><InvitationsLog /></PanelPage> }]
          : []),
      ]),
      provideAll(rt.slots, headerItemsSlot, [
        { id: "group", order: 10, Component: () => <GroupPill state="connected" /> },
        { id: "avatar", order: 30, Component: AvatarMenu },
      ]),
      provideAll(rt.slots, menuItemsSlot, [
        menuItem(ShowPanel, { id: "team" }, { id: "mesh.team", menu: "Mesh", order: 10, label: "Team", Icon: Users }),
        ...(admin
          ? [menuItem(ShowPanel, { id: "invitations-log" }, { id: "mesh.invitations", menu: "Mesh", order: 20, label: "Invitations log", Icon: Mail })]
          : []),
        menuItem(ShowPanel, { id: "my-identity" }, { id: "mesh.identity", menu: "Mesh", order: 30, label: "My identity and devices", Icon: UserRound }),
        menuItem(OpenSettings, { section: "me" }, { id: "mesh.link", menu: "Mesh", order: 40, label: "Link a device…", Icon: Smartphone }),
        ...(admin
          ? [menuItem(OpenSettings, { section: "services" }, { id: "mesh.services", menu: "Mesh", order: 50, label: "Services…" })]
          : []),
        menuItem(Lock, undefined, { id: "file.lock", menu: "File", order: 90, label: "Lock", Icon: LockIcon }),
        menuItem(ShowPanel, { id: "team" }, { id: "view.team", menu: "View", order: 45, label: "Team", Icon: Users }),
      ]),
      settingsTab(rt.slots, "me", 10, () => <MyIdentityPage />),
      settingsTab(rt.slots, "browser", 60, (go) => <BrowserData onOpenIdentity={() => go("me")} />),
      admin ? settingsTab(rt.slots, "team", 100, () => <TeamOneList viewer="admin" />) : () => {},
      admin ? settingsTab(rt.slots, "invitations", 105, () => <InvitationsLog />) : () => {},
      admin ? settingsTab(rt.slots, "services", 108, () => <Services variant="inline" />) : () => {},
      handle(rt, Lock, () => locked.set(true)),
      rt.slots.provide(overlaysSlot, { id: "lock", Component: LockScreen }),
    );
  },
};
```

- [ ] **Step 8: Write `src/app/app.tsx`**

```tsx
import { useRef, useState } from "react";
import type { Commander } from "../file-panels/use-commander.js";
import type { Viewer } from "../settings/settings-model.js";
import type { Mode } from "../workspace-layout/responsive.js";
import { activity } from "./features/activity.js";
import { assistant } from "./features/assistant.js";
import { core } from "./features/core.js";
import { files } from "./features/files.js";
import { indexing } from "./features/indexing.js";
import { mesh } from "./features/mesh.js";
import { sites } from "./features/sites.js";
import { todos } from "./features/todos.js";
import {
  type AppRuntime,
  AppRuntimeContext,
  contributeAll,
  createRuntime,
  type Feature,
} from "./runtime.js";
import { AppShell } from "./shell/app-shell.js";

export const allFeatures: Feature[] = [core, files, todos, sites, indexing, assistant, activity, mesh];

export interface AppProps {
  /** Claire (admin) or Hugo (member): a member gets no admin menus, views or settings. */
  viewer?: Viewer;
  /** The ids of the features switched on (`allFeatures`); all by default. */
  features?: string[];
  initialMode?: Mode;
  /** The buses to use; tests pass one to read what the features contributed. */
  runtime?: AppRuntime;
}

/**
 * The whole app, signed in to a mesh. Changing the viewer or the features
 * starts a new App (`key`), so contributions are made once and never patched.
 * Contributions are not disposed on unmount: they live in this App's own
 * buses and go with them, and none of them touches anything outside.
 */
export function App({
  viewer = "admin",
  features = allFeatures.map((f) => f.id),
  initialMode,
  runtime,
}: AppProps) {
  return (
    <AppInstance
      key={`${viewer}:${features.join(",")}`}
      viewer={viewer}
      features={features}
      initialMode={initialMode}
      runtime={runtime}
    />
  );
}

function AppInstance({
  viewer,
  features,
  initialMode,
  runtime,
}: Required<Pick<AppProps, "viewer" | "features">> & Pick<AppProps, "initialMode" | "runtime">) {
  const commander = useRef<Commander | null>(null);
  const [rt] = useState(() => {
    const rt = runtime ?? createRuntime();
    contributeAll(
      rt,
      allFeatures.filter((f) => features.includes(f.id)),
      { viewer, commander },
    );
    return rt;
  });
  return (
    <AppRuntimeContext.Provider value={rt}>
      <AppShell commanderRef={commander} initialMode={initialMode} />
    </AppRuntimeContext.Provider>
  );
}
```

- [ ] **Step 9: Run the tests to see them pass**

Run: `pnpm vitest --run test/app.test.tsx`
Expected: 7 passed. The first test lists any menu item whose command no handler answers; fix the feature that contributed it.

- [ ] **Step 10: Full checks** — as Task 1 Step 7. The Notifications and Conversations stories must still pass in `stories.test.tsx`.

- [ ] **Step 11: Commit**

```bash
git add apps/ui-protos.app/src apps/ui-protos.app/test/app.test.tsx
git commit -F - <<'EOF'
feat(ui-protos.app): App features — files, todos, sites, indexing, assistant, activity, mesh

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013q49VfKpaNy7AsN3rNRbUz
EOF
```

---

### Task 6: The App stories and their page

**Files:**
- Create: `apps/ui-protos.app/src/app/app.stories.tsx`
- Create: `apps/ui-protos.app/src/app/app.mdx`
- Modify: `apps/ui-protos.app/test/stories.test.tsx` (add the App stories)

**Interfaces:**
- Consumes: `App`, `allFeatures` (Task 5); `modeFor` (`workspace-layout/responsive.ts`).
- Produces: stories under **App/Sandclaw**: Desktop, Tablet, Phone, MemberViewer, FeaturesOff.

- [ ] **Step 1: Add the stories to the smoke test (failing)**

In `test/stories.test.tsx` add `import * as app from "../src/app/app.stories.js";` and `...Object.entries(composeStories(app)),` to the list.

Run: `pnpm vitest --run test/stories.test.tsx`
Expected: FAIL — cannot resolve `../src/app/app.stories.js`.

- [ ] **Step 2: Write `src/app/app.stories.tsx`**

```tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { modeFor } from "../workspace-layout/responsive.js";
import { App, type AppProps, allFeatures } from "./app.js";

const WIDTHS = { desktop: undefined, tablet: 820, phone: 390 } as const;
type Frame = keyof typeof WIDTHS;

/** The App in a frame of the chosen width; the App picks its mode from its own width. */
function AppFrame({ frame = "desktop", ...props }: Omit<AppProps, "runtime"> & { frame?: Frame }) {
  const width = WIDTHS[frame];
  return (
    <div className="mx-auto h-svh border-x" style={{ width: width ?? "100%" }}>
      <App {...props} initialMode={width ? modeFor(width) : "desktop"} />
    </div>
  );
}

const meta = {
  title: "App/Sandclaw",
  component: AppFrame,
  parameters: { layout: "fullscreen" },
  argTypes: {
    frame: { control: "inline-radio", options: Object.keys(WIDTHS) },
    viewer: { control: "inline-radio", options: ["admin", "member"] },
    features: {
      control: "check",
      options: allFeatures.map((f) => f.id),
    },
  },
  args: { frame: "desktop", viewer: "admin", features: allFeatures.map((f) => f.id) },
} satisfies Meta<typeof AppFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = { name: "Desktop" };
export const Tablet: Story = { name: "Tablet (820 px)", args: { frame: "tablet" } };
export const Phone: Story = { name: "Phone (390 px)", args: { frame: "phone" } };
export const MemberViewer: Story = { name: "A member (Hugo)", args: { viewer: "member" } };
export const FeaturesOff: Story = {
  name: "Features switched off (no Sites, no Indexing)",
  args: {
    features: allFeatures.map((f) => f.id).filter((id) => id !== "sites" && id !== "indexing"),
  },
};
```

- [ ] **Step 3: Write `src/app/app.mdx`**

```mdx
import { Meta, Story } from "@storybook/addon-docs/blocks";
import * as Stories from "./app.stories.tsx";

<Meta of={Stories} />

# The app, signed in

Every main view of Sandclaw in one window, for someone who has already joined a mesh: the
menus reach every feature, the activity bar switches the side views, the file panels and
documents share the center, and Settings covers everything configurable.

## How it is put together

- **Features** (Files, Todos, Sites, Indexing, Assistant, Tasks and notifications, Mesh) each
  add their views, menu items, settings sections and top-bar items to **slots**, and handle
  **commands**. The shell only renders the slots and handles the dock and Settings commands.
- A menu item names a command, so the menubar, the phone's ☰, keyboard shortcuts and the avatar
  menu all run the same thing.
- Switch a feature off in the controls: its views, menu items and settings sections all go. Switch
  the viewer to Hugo: the admin items go.

## Screen sizes

| Width | What it shows |
| --- | --- |
| 1024 px and wider | menus, activity bar, the dock: side views left, file panels and documents center, Assistant right, Tasks at the bottom |
| 640–1023 px | menus, activity bar, the dock's center and Tasks; side views and the Assistant open as overlays |
| below 640 px | ☰, one view at a time, a bottom bar: Files, Todos, Assistant, Tasks, More |

<Story of={Stories.Desktop} inline={false} height="720px" />
```

- [ ] **Step 4: Run the smoke test to see it pass**

Run: `pnpm vitest --run test/stories.test.tsx`
Expected: PASS, including 5 App stories.

- [ ] **Step 5: Full checks, and a Storybook build**

As Task 1 Step 7, then `pnpm build` in `apps/ui-protos.app`. Expected: "Storybook build completed successfully".

- [ ] **Step 6: Commit**

```bash
git add apps/ui-protos.app/src/app/app.stories.tsx apps/ui-protos.app/src/app/app.mdx apps/ui-protos.app/test/stories.test.tsx
git commit -F - <<'EOF'
feat(ui-protos.app): App stories — desktop, tablet, phone, member, features off

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013q49VfKpaNy7AsN3rNRbUz
EOF
```
