# @statewalker/chat-mini.chat-react

## What it is

The React renderer fragment for chat in `chat-mini.app`. Its init binds the `chat` catalog declared by `@statewalker/chat-mini.chat` to the chat panel component, registers the built-in turn-block views (user message, agent message, tool calls, error) and contributes them to the `chat:turn-blocks` slot, adds a sessions side panel on the left of the dock (280px default), and mounts a deep-link handler that opens the session named in `?s=<id>`. This package is private and used only inside this repository.

## Why it exists

All chat React code lives here so that `@statewalker/chat-mini.chat` and every fragment that only dispatches chat commands stay free of React. Built-in turn blocks go through the same slot as plug-in blocks, so adding a new kind of turn content needs no change in this package.

## How to use

Add it as `"@statewalker/chat-mini.chat-react": "workspace:^"`. Peer dependencies: `react` and `react-dom` (^19.3.0). Run it as a renderer fragment after `@statewalker/chat-mini.chat`'s logic fragment, and import the styles once:

```ts
import initChat from "@statewalker/chat-mini.chat/fragment";
import initChatReact from "@statewalker/chat-mini.chat-react/fragment";
import "@statewalker/chat-mini.chat-react/styles";

bootShell({ logic: [initChat], renderers: [initChatReact] });
```

| Subpath | What it gives |
| --- | --- |
| `.` (`src/index.ts`) | Hooks and helpers: `useChatPanelContext` (+ `ChatPanelContextValue`), `useChatSession`, `useFocusedChatTab`, `useOpenChatTabs`, `setSessionModel`. |
| `./fragment` (`src/fragment.ts`) | Default export: the renderer-fragment init `(ctx) => cleanup`. |
| `./styles` (`src/styles.css`) | Tailwind v4 `@source` directives for this package's classes. |

The package ships TypeScript sources only; the app's bundler compiles them.

## Examples

### Read the current chat panel from a composer action

```tsx
import { useChatPanelContext } from "@statewalker/chat-mini.chat-react";

function MyComposerButton() {
  const panel = useChatPanelContext(); // { sessionId } or null outside a chat panel
  return <button type="button">{panel?.sessionId}</button>;
}
```

### Track which chat tabs are open

```ts
import { useFocusedChatTab, useOpenChatTabs } from "@statewalker/chat-mini.chat-react";

const focused = useFocusedChatTab(); // session id or undefined
const open = useOpenChatTabs();      // ReadonlySet<string> of session ids
```

## Internals

- **Deep links fire once.** The deep-link mount reads `window.location.search` on mount and, when `?s=<id>` is present, dispatches `chat:open-session` after the workspace shell reaches `ready`. Tab focus changes do not write the URL back.
- **Dependencies.** `@statewalker/chat-mini.chat` (catalog, commands, slots), the shell and render view packages for the dock and json-render registry, `@tanstack/react-query` for session queries, and the shared UI packages for components.

## License

MIT. See [LICENSE](../../LICENSE).
