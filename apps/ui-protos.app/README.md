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
  mock.ts            invented company, office machine, team and invites
  <topic>/
    <topic>.tsx          one exported component per variant
    <topic>.stories.tsx  one story per variant or state, titled "Prototypes/<Topic>"
    <topic>.mdx          the question, each variant in a <Canvas>, trade-offs, open questions
test/
  stories.test.tsx   renders every story in jsdom
vite.config.ts       Tailwind + React; Storybook reuses it
```

Current prototypes: **Invite colleague** (link dialog vs. team panel), **Join from invite** (single card vs. explain-then-join, with connecting and offline states), **Office link status** (dot vs. pill vs. banner).

## How to run it

1. From the repository root: `pnpm install`.
2. `pnpm --filter @statewalker/ui-protos-app dev`, then open http://localhost:6006.
3. To publish: `pnpm --filter @statewalker/ui-protos-app build` and copy `apps/ui-protos.app/dist/` to the static host. `pnpm --filter @statewalker/ui-protos-app preview` serves the built folder on http://localhost:6007 to check it first.

To add a prototype, create the three files of a `src/<topic>/` folder as described on the Welcome page, and add its stories module to `test/stories.test.tsx`.

## Why it is the way it is

- **Storybook, not a hand-built site.** A prototype is mostly variants and states of one screen. Storybook gives each one an isolated URL, controls for switching state (`args`), and a light/dark switch, and its MDX pages hold the discussion with `<Canvas of={…}>` embeds — so prose sits next to the variants without writing a variant-display layout or one React root per interactive island.
- **Primitives come from `@statewalker/ui.view.shadcn`, not a local shadcn copy.** The prototypes then stay in step with the components the app actually ships. A primitive that package does not export yet (badges, popovers) is drawn with plain Tailwind classes in the prototype.
- **Prototype components live next to their stories, outside any package.** They are throwaway: when a direction wins it is rebuilt in the real packages, against real models, and the prototype folder is deleted or kept as the record of the alternatives.
- **The output directory is `dist/`**, like every other package of this workspace, so turbo caches it and `.gitignore` already covers it.

## What will surprise you

- **A shadcn component renders without colours or borders.** Its classes were not generated: Tailwind does not scan `node_modules` by itself. `src/index.css` adds `@source "../node_modules/@statewalker/ui.view.shadcn/src/**/*.tsx"`; a new primitive package needs a line of its own.
- **Borders look black.** The `* { @apply border-border }` base rule in `src/index.css` is missing; without it Tailwind 4 draws borders in `currentColor`.
- **The build warns `Some chunks are larger than 500 kB`.** That is Storybook's own manager and docs bundle. The site still works; the warning is expected.
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
