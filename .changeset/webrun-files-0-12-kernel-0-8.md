---
"@statewalker/file-mounts.core": minor
"@statewalker/file-panels.core": minor
"@statewalker/wiki.core": minor
"@statewalker/wiki.view.react": minor
---

Move to `@statewalker/webrun-files` 0.12 (sandclaw#61), with the statewalker-kernel 0.8, statewalker-ai and statewalker-shell-react lines built on it. Paths now resolve `..` before any mount or guard sees them, and a path that climbs above the root throws.
