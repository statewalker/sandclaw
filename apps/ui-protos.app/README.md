# @statewalker/ui-protos-app

## What it is

A Storybook of Sandclaw UI prototypes: alternative designs of the same screen, shown side by side, with the reasoning about them written next to the components. It builds to a static site (`dist/`) that can be served from any static host. Prototypes use the shadcn primitives from `@statewalker/ui.view.shadcn` and the theme tokens of `chat-mini.app`, so a variant looks the way it would in the app. This app is private and not published.

## Layout

```
.storybook/
  main.ts            story globs (src/**/*.mdx, src/**/*.stories.tsx) and addons
  preview.tsx        loads src/index.css; light/dark theme switch in the toolbar
src/
  index.css          Tailwind entry, theme tokens, shadcn base rules
  welcome.mdx        landing page: what the site is and how to add a prototype
  zone-title.tsx     the heading a zone panel shows when its tab strip is hidden
  mock.ts            invented group, its folder, team and invites
  <topic>/
    <topic>.tsx          one exported component per variant
    <topic>.stories.tsx  one story per variant or state, titled "Prototypes/<Topic>"
    <topic>.mdx          the question, each variant in a <Canvas>, trade-offs, open questions
test/
  stories.test.tsx   renders every story in jsdom
  *.test.tsx         behaviour a prototype claims (e.g. what each layout preset contains)
  setup.ts           jsdom stubs (ResizeObserver, which dockview needs)
vite.config.ts       Tailwind + React; Storybook reuses it
```

Current prototypes: **Workspace layout** (one dockview with zones and presets; panels name their target zones; two lock options; layout repair when a plugin is uninstalled), **Assistant panel** (tasks with steps and output files; approval before changing a file and consent before using a connector, inline or pinned), **Join from invite** (minimal vs three promises; then choosing a folder; machine offline; invite already used), **Group status** (pill only vs pill and offline banner), **Folder zone** (search; reconnect after a restart; indexing as a progress bar vs dimmed unread files), **Notes and todos** (todos collected from Markdown checklists across the folder, grouped by file vs one list), **Invite colleague** (link dialog vs team panel; to be reworked into the admin Team section).

## How to run it

1. From the repository root: `pnpm install`.
2. `pnpm --filter @statewalker/ui-protos-app dev`, then open http://localhost:6006.
3. To publish: `pnpm --filter @statewalker/ui-protos-app build` and copy `apps/ui-protos.app/dist/` to the static host. `pnpm --filter @statewalker/ui-protos-app preview` serves the built folder on http://localhost:6007 to check it first.

To add a prototype, create the three files of a `src/<topic>/` folder as described on the Welcome page, and add its stories module to `test/stories.test.tsx`.

## Why it is the way it is

- **Storybook, not a hand-built site.** A prototype is mostly variants and states of one screen. Storybook gives each one an isolated URL, controls for switching state (`args`), and a light/dark switch, and its MDX pages hold the discussion with `<Canvas of={…}>` embeds — so prose sits next to the variants without writing a variant-display layout or one React root per interactive island.
- **Primitives come from `@statewalker/ui.view.shadcn`, not a local shadcn copy.** The prototypes then stay in step with the components the app actually ships. A primitive that package does not export yet (badges, popovers) is drawn with plain Tailwind classes in the prototype.
- **Prototype components live next to their stories, outside any package.** They are throwaway: when a direction wins it is rebuilt in the real packages, against real models, and the prototype folder is deleted or kept as the record of the alternatives.
- **The workspace prototype runs the real `dockview-react`.** Its question is technical as much as visual: whether one dock can look fixed until the user unlocks it. Each panel names its target zones (`left`, `center`, `right`, `bottom`) in order of preference; a preset says which zones exist and their sizes. `src/workspace-layout/zones.ts` is the only code that touches dock positions.
- **The output directory is `dist/`**, like every other package of this workspace, so turbo caches it and `.gitignore` already covers it.

## What will surprise you

- **A shadcn component renders without colours or borders.** Its classes were not generated: Tailwind does not scan `node_modules` by itself. `src/index.css` adds `@source "../node_modules/@statewalker/ui.view.shadcn/src/**/*.tsx"`; a new primitive package needs a line of its own.
- **Borders look black.** The `* { @apply border-border }` base rule in `src/index.css` is missing; without it Tailwind 4 draws borders in `currentColor`.
- **The build warns `Some chunks are larger than 500 kB`.** That is Storybook's own manager and docs bundle. The site still works; the warning is expected.
- **"Layout locked" still lets zones be resized.** It is dockview's `disableDnd` plus hidden side-zone tab strips. Dockview's own `locked` option freezes the resize handles as well, so it is deliberately not used.
- **A preset's zone sizes are ignored.** They must be set after every zone exists (`applyPreset` does it last): dockview rebalances sizes each time a zone is added, and a group's default minimum height is 100px, so the bottom strip also needs its constraint lowered. Dockview does not save constraints in a layout snapshot, so `syncZones` sets it again after every change.
- **The page freezes after a layout change.** `syncZones` runs on every layout change, and setting a header's visibility or a constraint fires another one. It must only touch what differs. jsdom does not fire these events, so the tests cannot catch this; check the built site in a browser.
- **`ResizeObserver is not defined` in a test.** jsdom lacks it; `test/setup.ts` stubs it for dockview.
- **A new prototype is not tested.** `test/stories.test.tsx` imports each stories module by name; a prototype is not covered until it is added there.

## Reference

### Commands

| Command | What it does |
| --- | --- |
| `pnpm --filter @statewalker/ui-protos-app dev` | Storybook dev server on port 6006. |
| `pnpm --filter @statewalker/ui-protos-app build` | Static site into `dist/`. |
| `pnpm --filter @statewalker/ui-protos-app preview` | Serves `dist/` on port 6007. |
| `pnpm --filter @statewalker/ui-protos-app test` | Vitest (jsdom): every story renders. |
| `pnpm --filter @statewalker/ui-protos-app typecheck` | `tsc --noEmit`. |
| `pnpm --filter @statewalker/ui-protos-app lint:check` | Biome check. |
