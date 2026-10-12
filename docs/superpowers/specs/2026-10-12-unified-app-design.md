# Unified app view — design

A Storybook prototype of the whole Sandclaw app as a user sees it once they have joined a mesh:
every main category of views in one window, reachable from Theia-style menus, laid out on the
commander dock, on desktop, tablet and phone.

## Purpose

The prototypes in `apps/ui-protos.app` each show one feature on its own. Nobody can see the app
as a whole: how chat, files, todos, sites, indexing and the mesh sit together, how one reaches
the other, and what the settings cover. The **App** story answers that, for a user who is
already joined to the mesh and has access to every feature.

Success: a person opening the App story can reach every main feature from the menus, the
activity bar or (on a phone) the bottom bar; can drag any tab anywhere on desktop; can open
Settings at any section; and follows a few links across views (a todo or a citation opens its
file) inside one consistent demo world.

### Out of scope

- Joining or setting up a mesh (installer, join from invite, first-run onboarding). Those stay
  separate stories; Help › First steps shows the after-joining guide only.
- Real data, persistence, or a real backend. Everything is the in-memory demo world.
- Changing what the existing prototype components do. They gain only a fill mode, optional
  callbacks, and (Settings) a controllable dialog.
- Promoting anything to the view packages. Findings for the real contracts are recorded below.

## Decisions

| # | Decision | Why |
|---|---|---|
| 1 | A new `src/app/` prototype with an **App** story; the Workspace and Commander stories stay as focused studies | Growing either of them into the app loses the study and mixes two jobs in one component |
| 2 | **Shared demo world**: every view shows Atelier Morel (`src/mock.ts`); a few cross-view links work, other actions stay local | A showcase with disagreeing data misleads; a fully wired model is close to building the app |
| 3 | **Theia-style arrangement**: activity bar, left side view, file panels in the center, assistant on the right, tasks and notifications at the bottom | Matches the request; every view is still a dock panel and can be dragged anywhere |
| 4 | **Slots and commands in the App layer only** (`@statewalker/shared-slots`, `@statewalker/shared-commands`); prototype components keep plain props | One source for menus, views and settings sections; features switch on and off as units; existing stories need no bus |
| 5 | Reuse the real contracts' keys and shapes where they exist (`dock:show-panel`, `dock:focus-panel`, `dock:close-panel`, menubar items, `settings:tabs`) without depending on `app-shell` or `shell.core` | The prototype exercises the contracts the real app uses; it stays a standalone app |
| 6 | Menubar on Radix Menubar (`@radix-ui/react-menubar`), local to `ui-protos` | Keyboard navigation, submenus and ARIA roles for free; `ui.view.shadcn` has no menu primitive |
| 7 | Two stages, one plan each: **1. Shell**, **2. Shared world and links** | Each stage ends with a working, reviewable App story |

## Contracts — `src/app/contracts.ts`

One file declares every slot and command of the App, so "who handles this?" has one answer.

### Slots

| Slot | Kind | Value |
|---|---|---|
| `app:views` | keyed by view id | `{ id, title, Icon, zone: "left" \| "center" \| "right" \| "bottom", activity?: number, adminOnly?, component, mobile?: "tab" \| "more" }` — `activity` places it on the activity bar (order); `mobile` places it on the phone's bottom bar or under More |
| `app:menu-items` | plain | the real `MenubarItem` shape (`id, menu, order, label, Icon`) plus `shortcut?`, `submenu?`, `adminOnly?`, `command` and `payload?` instead of `onActivate`, `enabled?(state)` |
| `settings:tabs` | keyed by section id | `{ id, label, group: "you" \| "admin", keywords, component, order }` |
| `app:header-items` | plain | items right of the menus (group pill, bell, avatar) |

### Commands

All `Command.silent` with `passthrough` payloads, as `wiki:open-site` does.

| Command | Payload | Handled by |
|---|---|---|
| `dock:show-panel` | `{ id, params? }` — opens the view in its zone, or focuses it | shell |
| `dock:focus-panel` / `dock:close-panel` | `{ id }` | shell |
| `settings:open` | `{ section? }` | shell |
| `app:set-theme` | `{ theme: "light" \| "dark" \| "system" }` | core |
| `files:open` | `{ path, citation? }` | files |
| `files:reveal` | `{ path }` — its folder in the active file panel | files |
| `files:new-panel`, `files:copy`, `files:move`, `files:rename`, `files:new-folder`, `files:delete` | `{}` — act on the active file panel | files |
| `notes:new` | `{}` | notes-todos |
| `sites:open` / `sites:edit-toc` | `{ site }` | sites |
| `indexing:show` | `{ path? }` | indexing |
| `assistant:new-chat` / `assistant:conversations` / `assistant:how-answered` | `{}` — the last one explains the latest answer | assistant |
| `mesh:link-device` | `{}` | mesh |

Opening a view (View › Sites, Mesh › Team, Mesh › Group status, which is the Team view's header) is `dock:show-panel` with the view's id; no feature-specific command is needed for it.

Shortcuts (`Ctrl+,`, F5, F6, F2, F7, Del) are read from the menu-items slot by one key handler;
there is no second list of shortcuts.

### Findings for the real contracts

The real `MenubarItem` has no shortcut, submenu, admin-only flag or enabled state, and calls a
closure instead of naming a command. The prototype adds these; if they prove out, they are
proposed for `app-shell:menubar-items`.

## Features as modules — `src/app/features/*.ts`

Each feature exports `contribute(slots, commands, ctx) => dispose`, where `ctx` carries the
viewer and the demo world. The App calls every enabled feature's `contribute`; turning a feature
off calls its `dispose`, which removes its views, menu items, settings sections and handlers
together. The shell itself contributes nothing feature-specific.

| Feature | Views (zone) | Menu items | Settings sections | Commands |
|---|---|---|---|---|
| core | — | Help › Keyboard shortcuts (built from the menu-items slot), About Sandclaw · View › Layout ▸, Theme ▸ | Appearance | `app:set-theme` |
| files | Files tree (left) · file panels and viewers (center) | File › New file panel, Close tab, Storages… · Edit › Copy to other panel F5, Move F6, Rename F2, New folder F7, Delete Del, Find in files… · Go › Go to file…, Recent documents ▸ | Storages (new) | `files:*` |
| notes-todos | Todos (left) · note editor (center) | File › New note | — | `notes:new` |
| sites | Sites list (left) · site viewer, table-of-contents editor (center) | View › Sites | — | `sites:*` |
| indexing | Indexing tree (left) · Indexing page, Explore the indexes (center) | View › Indexing | What the assistant reads | `indexing:show` |
| assistant | Assistant (right) · Conversations (center) | Assistant › New chat, Conversations, How it was answered, Agent tools…, Connectors…, AI models… (admin) | Connectors · Agent tools · AI models (admin) | `assistant:*` |
| activity | Tasks, Notifications (bottom) · bell (header) | View › Tasks and notifications | Notifications | — |
| mesh | Team (left) · My identity and devices, Invitations log (center) · Link a device (dialog) · group pill, avatar (header) | Mesh › Group status, Team, Invitations log, My identity and devices, Link a device…, Services (admin) · File › Lock | Me · This browser · Team, Invitations, Services (admin) | `mesh:*` |
| help | First steps (center) | Help › First steps | — | — |

**Rule:** every menu item names a command that some enabled feature handles. Items with
nothing behind them are left out, not greyed out. Admin-only contributions are hidden for a
member viewer.

## The top bar

- Left: **File · Edit · View · Go · Assistant · Mesh · Help**, from `app:menu-items`, grouped
  by `menu`, ordered by the lowest `order` in each.
- Right: `app:header-items` — group pill (Atelier Morel, online), notification bell, Claire's
  avatar (My identity and devices · Settings · Lock).
- Desktop and tablet: the menubar; Alt or F10 focuses it, arrows move, Escape closes.
- Phone: one ☰ button opens the same items as a full-height list with nested pages; the bell
  and the avatar stay.
- Edit's file commands are disabled while no file panel is active (`enabled?(state)`).

## Layout in each mode

Modes follow the App's container width (`responsive.ts`: desktop ≥ 1024, compact 640–1023,
mobile < 640), so the story's width control works inside the canvas.

**Desktop**

```
File Edit View Go Assistant Mesh Help          (Atelier Morel ●) 🔔 (CM)
┌──┬────────────┬──────────────────────────────┬───────────┐
│📁│ side view  │ [clients ✕][2026-Q3 ✕][offer]│ Assistant │
│☑ │            │  file panel  │  file panel   │           │
│🌐│            │                              │           │
│🔎│            │                              │           │
│👥│            │                              │           │
│  ├────────────┴──────────────────────────────┴───────────┤
│⚙ │ Tasks · Notifications                                 │
└──┴───────────────────────────────────────────────────────┘
```

- **Activity bar** (48 px, outside the dock): the views with `activity` set, Settings at the
  bottom. A click shows the view in the left bar; clicking the active one collapses the left
  bar; a view the user dragged elsewhere is focused where it is.
- **Side views are the compact versions** and open their details as center tabs.
- **Center:** two file panels (Clients/Dupont, Finance); opened files are tabs in the group of
  the panel they were opened from; larger pages (Conversations, Explore, a site, a note, My
  identity) open as center tabs.
- **Right:** Assistant. **Bottom:** Tasks and Notifications as tabs of one panel, a 48 px strip
  by default.
- Every tab drags anywhere. Sizes: left 260, right 360, bottom 48. View › Layout: **Assistant**
  (above), **Reading** (no right bar, no bottom strip), **Reset**.

**Tablet:** the menubar and the activity bar stay; the dock has the center and the bottom
strip; side views and the Assistant open as overlays from the activity bar
(`SidePanelOverlays`). Drag and drop with a mouse, off on touch.

**Phone:** ☰, the active view's title, the bell, the avatar on top; one view at a time
(`MobileStack`); bottom bar **Files** (file panels and documents with a tab row), **Assistant**,
**Todos**, **Tasks**, **More** (Sites, Indexing, Team, Conversations). A document opens full
screen with Back.

**All modes:** each mode keeps its own arrangement; panels size to their own width (container
queries).

**Fill mode.** Page-shaped components (Sites, Conversations, Notifications, Team, Indexing page,
Explore, AI models, Invitations log, My identity, First steps) gain a way to fill their panel
(`h-full w-full`, no card frame) instead of their story card size. Each story keeps its look.

## Settings dialog

- Opened by `settings:open` from File › Settings… (`Ctrl+,`), the activity bar's ⚙, the avatar
  menu, and deep links (File › Storages…, Assistant › Connectors…, the bell's notification
  settings, Team's Manage). Without a section it opens at the last one shown.
- Desktop and tablet: a modal about 90% of the window, at most 1100×760; sections grouped
  **You** and **Admin** with the search box above; Escape or ✕ closes; the app behind keeps its
  state. Phone: full screen, the section list first, each section a sub-page with Back.
- Sections come from `settings:tabs`: Me · Appearance · Notifications · **Storages** ·
  Connectors · Agent tools · This browser · What the assistant reads; admin: Team · Invitations
  · Services · AI models.
- Appearance changes the app behind the dialog at once (theme). Other sections stay local.

**Changes to `src/settings/`:** export the body as `SettingsBody` with controlled `section` /
`onSectionChange` and a `sections` prop (the default stays `settings-model.ts`, so the Settings
story is unchanged); the `dialog` variant takes `open` / `onOpenChange`, and the fake workspace
behind it moves into the Settings story.

## Stage 1 — Shell

Contracts and buses; the menubar and ☰ list; the activity bar; the dock host on `zones.ts` and
`useFilesInDock`; the bottom panel; tablet overlays and the phone stack; the Settings dialog
host and the `src/settings/` changes; every feature module contributing its views, menu items
and settings sections, with commands that open views and Settings; fill mode on the page-shaped
components; the App stories.

Stories under **App/**: Desktop, Tablet (820 px), Phone (390 px), Member viewer (Hugo),
Features off (controls). Controls: `viewer`, `features`, `width`.

## Stage 2 — Shared world and links

- **One world.** `newDemoStorages()` uses the Atelier Morel tree from `mock.ts`: Clients/Dupont,
  Clients/Leroy (replacing Martin), Finance/2026-Q3.xlsx, Notes/todo.md. Storage settings' demo
  mounts drop "acme" for Atelier Morel's storages. Tests that name "martin" change to "leroy".
- **Links**, each an optional callback on its component, turned into a command by its feature:
  1. a todo's file reference → `files:open`;
  2. an assistant citation, or a grounded answer's source → `files:open {path, citation}`; the
     viewer highlights the cited passage;
  3. an indexing tree item, or an Explore result → `files:reveal`;
  4. a notification → its target (file, site, Settings section);
  5. the site viewer's Edit table of contents → `sites:edit-toc`; a page's source → `files:open`;
  6. Team's Manage → `settings:open {section: "team"}`; the group pill → Mesh › Group status.
- **Where `files:open` lands:** desktop and tablet, a viewer tab in the active file panel's
  group; phone, the Files view switches to the document, full screen with Back.

## Testing

jsdom, real components, public seams; no mocks of the code under test.

- **Contracts:** with every feature on, every menu item's command has a handler; turning a
  feature off leaves no view, menu item or settings section of it; a member viewer sees no
  admin item.
- **Shell:** the desktop layout puts each view in its zone; `Ctrl+,` and File › Settings… open
  the dialog, File › Storages… at Storages; the activity bar shows, collapses and focuses views;
  tablet opens overlays; phone shows the bottom bar and More; ☰ reaches the same items as the
  menubar.
- **Links (stage 2):** a todo and a citation open their file as a tab beside the active file
  panel, and full screen on a phone.
- **Stories:** `stories.test.tsx` renders the App stories.

## Dependencies added to `ui-protos`

`@statewalker/shared-slots` and `@statewalker/shared-commands` (both in the workspace catalog;
payloads use the package's own `passthrough`, no schema library), and `@radix-ui/react-menubar`.
