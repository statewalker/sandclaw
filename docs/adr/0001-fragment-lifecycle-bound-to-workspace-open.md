# ADR 0001 — Fragment lifecycle is bound to `Workspace.open()` / `close()`

Date: 2026-05-08
Status: accepted

## Context

chat-mini.app boots with a `Workspace` that is **not open** until the
user connects a folder via `workspace.setFileSystem(files, label)` +
`workspace.open()`. Connection happens lazily (the user clicks
"Connect folder" in the UI) and may happen many times — the user can
switch folders, reconnect after a permission lapse, or disconnect.

Most fragments need `FilesApi` to do their real work:

- `chat` reads/writes session files under `<root>/.settings/sessions/`.
- `providers` reads/writes `<root>/.settings/providers.json`.
- `agent-runtime` exposes `FilesApi` to tool factories
  (`createFileTools(ctx.files, …)`).
- `files` is a thin wrapper around `FilesApi` and serves every other
  fragment via `files:*` intents.

The architectural question: what is a fragment supposed to do
**before** the workspace is open, and what happens when the workspace
**closes** (folder switch / disconnect)?

## Alternatives considered

1. **Defensive code per fragment.** Each manager guards every
   FilesApi access with `if (workspace.files) { … }`. Pre-open, every
   feature renders an empty state. Folder switching means each
   fragment notices the change via `BaseClass.notify()` and reloads
   per-feature. Spreads the lifecycle concern across every fragment.
2. **In-memory fallback.** `workspace-bridge` calls
   `setFileSystem(memoryFs, "(unsaved)") + open()` at boot. Fragments
   always see a FilesApi. Folder pick = `close()` + new
   `setFileSystem` + `open()`. Hides the "no folder yet" state from
   fragments — but encourages users to type into a workspace that
   silently throws away its data.
3. **Fragment lifecycle bound to workspace lifecycle.** Fragments
   subscribe to `onLoad`/`onUnload`; their real work starts on
   `onLoad` and tears down on `onUnload`. Pre-open and post-close,
   the fragment exists but holds no resources. Folder switch =
   `onUnload` then `onLoad`; managers rebuild themselves.

## Decision

**Option 3.** Every fragment manager is **re-entrant**:

- The fragment's `init` constructs a manager and registers
  `onLoad`/`onUnload` listeners on the workspace.
- The manager is dormant until `onLoad` fires. At construction
  time it may register intent handlers and slot providers (those
  don't depend on files), but FilesApi-dependent work waits.
- On each `onLoad`, the manager creates a fresh internal
  `newRegistry()` and does its real init: load on-disk state,
  register file-tool factories, build agent runtime, etc.
- On `onUnload`, that internal registry's cleanup runs (LIFO),
  releasing all resources accumulated since the last `onLoad`.
- A subsequent `onLoad` (folder switch) is just another cycle —
  the manager rebuilds against the new FilesApi.

UI elements that depend on workspace data (dock host, settings
dialog, chat surface) are **only visible after activation**.
Pre-open, App.tsx renders the directory-picker empty state from
`workspace-bridge`. Post-`open`, App.tsx swaps to the dock host
from `dock`. The two states are observable via the workspace's
`BaseClass.notify()` reactivity (`workspace.state === "open"`).

## Consequences

- **Per-manager pattern.** Every fragment that touches FilesApi
  follows the same structure:
  ```ts
  class FooManager {
    #onLoadRegistry: Registry | null = null;
    constructor({ workspace }) {
      workspace.onLoad(() => this.#startCycle(workspace));
      workspace.onUnload(() => this.#endCycle());
    }
    #startCycle(workspace) {
      const [register, cleanup] = newRegistry();
      this.#onLoadRegistry = { cleanup };
      // FilesApi-dependent registrations here
    }
    #endCycle() {
      this.#onLoadRegistry?.cleanup();
      this.#onLoadRegistry = null;
    }
  }
  ```
  Boilerplate, but uniform.
- **Subscriptions that don't depend on files** (intent handlers,
  slot providers, slot observers that only react to other
  fragments' contributions) live in the outer `init` registry.
  They survive workspace open/close cycles.
- **No empty states inside fragments.** A fragment is either fully
  working or not visible. The "you must connect a folder" UI lives
  exactly once, in `workspace-bridge`.
- **Fragment authors must avoid stashing FilesApi references in
  closures** that survive an `onUnload`. After unmount the
  reference is stale; using it is a bug. The boilerplate above
  (per-cycle registry) makes this hard to get wrong.
- **Tests.** Each manager test exercises at least two `onLoad` /
  `onUnload` cycles to prove re-entrancy.

## Why this is hard to reverse

Once a fragment is written assuming "the workspace is always open
and stays that way", retrofitting onUnload teardown means rewriting
every manager. The cost is concentrated in fragment authors;
formalising it now means everyone writes the right pattern from
the start.
