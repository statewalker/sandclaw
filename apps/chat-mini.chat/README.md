# @statewalker/chat-mini.chat

## What it is

The logic fragment for chat in `chat-mini.app`. Its init creates a `ChatManager` that handles the `chat:open-session` command (open or focus a chat tab for a session) and, when the workspace loads, recreates the specs of chat tabs saved in the dock layout. It also defines the chat catalog schema and two extension slots: turn blocks and composer actions. This package is private and used only inside this repository.

## Why it exists

Chat commands and slots must not depend on chat components, so other logic fragments (menus, the wiki, agent tools) can open sessions or contribute UI by dispatching commands and filling slots. The React side lives in `@statewalker/chat-mini.chat-react`, which binds the catalog this package declares. Splitting them keeps the components out of every package that only needs the commands or slot definitions.

## How to use

Add it as `"@statewalker/chat-mini.chat": "workspace:^"` and run the fragment as a logic fragment, after the spec store and dock fragments (the `@statewalker/app-shell` boot sequence already does this):

```ts
import initChat from "@statewalker/chat-mini.chat/fragment";
bootShell({ logic: [initChat], renderers: [/* initChatReact */] });
```

| Subpath | What it gives |
| --- | --- |
| `.` (`src/index.ts`) | `OpenChatSessionCommand`, `chatCatalog`, `CHAT_CATALOG_ID`, `makeChatSpec`, `chatPanelId`, `chatSpecId`, `turnBlocksSlot`, `composerActionsSlot`, `STANDARD_TURN_BLOCK_KINDS`, and the `TurnBlockContribution` / `ComposerAction` types. |
| `./fragment` (`src/fragment.ts`) | Default export: the logic-fragment init `(ctx) => cleanup`. |

The package ships TypeScript sources only; the app's bundler compiles them.

## Examples

### Open a chat session

```ts
import { OpenChatSessionCommand } from "@statewalker/chat-mini.chat";
import { Commands } from "@statewalker/shared-commands";

await workspace.requireAdapter(Commands).call(OpenChatSessionCommand, { sessionId }).promise;
```

Repeat calls focus the existing tab: the panel id is `chat:<sessionId>` and the spec id `spec:chat:<sessionId>`.

### Add a button to the composer

```ts
import { composerActionsSlot } from "@statewalker/chat-mini.chat";

slots.provide(composerActionsSlot, {
  id: "my-action",
  viewKey: "my-fragment:composer-button", // a component registered in the ViewRegistry
  position: "trailing",
});
```

## Internals

- **Turn blocks are a slot, not a switch.** `turnBlocksSlot` binds a block `kind` to a `viewKey`. The built-in kinds (`STANDARD_TURN_BLOCK_KINDS`: user message, agent message, tool calls, error) are contributed by the React fragment the same way a plug-in would add a new kind.
- **Layout restore happens on workspace load.** The dock applies a saved layout after the workspace connects; the specs for saved `chat:` panels must exist by then, so `ChatManager` creates them in `workspace.onLoad`.
- **Required adapters.** The init calls `requireAdapter` for `Commands`, `SpecStore` and `LayoutStore`; without them it throws `No adapter registered for …`.
- **One React-side import.** The package has no components, but `catalog.ts` takes the catalog `schema` from `@json-render/react`, so `@json-render/react` (and through it React) is still loaded with this package.
- **Dependencies.** The source imports `@statewalker/render.core` (spec store, layout restore), `shell.core` (dock commands), `shared-commands`, `shared-slots`, `shared-registry`, `workspace.core`, `@json-render/core` / `@json-render/react` and `zod` (catalog schema). `package.json` also lists `@statewalker/ai-agent.core`, `ai-agent-runtime.core`, `mime.core`, `inline.core`, `shared-baseclass`, `webrun-files` and `ai`, which the current source does not import.

## License

MIT. See [LICENSE](../../LICENSE).
