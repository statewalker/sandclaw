# ADR 0011 — Model-management UI moves from `dock:overlays` into Settings tabs

Date: 2026-05-21
Status: accepted (amends [ADR 0010](./0010-models-ui-as-json-render-specs.md))

## Context

[ADR 0010](./0010-models-ui-as-json-render-specs.md) chose to
mount the three model-management dialogs (Models List, Remote
Connections, Local Models) via `dock:overlays`, explicitly
**rejecting** the settings-tab approach (its "Alternative 2"):

> Settings-tab approach (one big tab in the settings dialog).
> Reuse settings-react's tab surface; put Models / Connections /
> Local on three sub-tabs. **Cons: hides Models behind Settings →
> Providers (worse discoverability for a frequent action); the
> composer's "All models…" entry still needs to jump to that
> tab**, which is what `OpenProviderConfigCommand` already does
> today and which we are explicitly replacing.

A new product brief reverses this for three reasons that ADR 0010
did not weigh:

1. The brief's UX puts **per-Connection model checkboxes** (the
   "starred" gesture) inside each Connection card. The
   cross-connection "Models List" dialog from ADR 0010 is
   redundant once each Connection owns its starred subset; the
   composer dropdown becomes the only cross-connection view.
2. The chat composer dropdown gains a per-session model
   selector backed by the brief's new "Configure models…"
   entry. That entry is *one click away* from Settings either
   way (`dock:overlays` opens its own dialog, `settings:tabs`
   opens Settings on a tab) — the discoverability argument
   ADR 0010 made disappears with the dropdown's "Configure
   models…" deep link.
3. The brief explicitly states **"this configuration panel
   should be available in 'Settings…'"**, signalling that
   product treats model management as configuration alongside
   theme, layout, etc., not as a top-level workbench surface.

The 4-tabs-per-Connection-type layout (Google / OpenAI /
Anthropic / OpenAI-compatible), per-connection starred
checkboxes, capability icons, and lifecycle verbs
(Connect / Check Connection / Disconnect) are recorded in
CONTEXT.md and are orthogonal to the mount-point question this
ADR settles.

## Alternatives considered

1. **Keep ADR 0010's `dock:overlays` mount; expose a thin
   Settings entry that just opens the overlays.** Smallest
   change to ADR 0010. The Settings entry is a discovery
   surface; the actual UI still lives in the dock dialogs. Pros:
   ADR 0010 stands. Cons: two surfaces for the same UI (the
   overlay AND the Settings tab body) — state has to stay in
   sync or the tab body has to be a button-launcher into the
   overlay, which is a confusing "Settings opens Settings"
   experience.
2. **Move dialogs INTO Settings as tabs (this ADR).** The
   Settings dialog hosts two tabs (Models & Connections; Local
   Models). No more `dock:overlays` contribution from
   `models-config`. The composer dropdown's "Configure models…"
   entry fires a `configure-models { typeHint? }` command that
   opens Settings on the right tab and sub-tab.
3. **Bespoke React inside Settings.** Drop json-render for this
   surface; write React components mounted as a settings tab.
   Reverses both ADR 0010's mount-point choice *and* its
   declarative-spec choice. Pros: no spec authoring. Cons: ADR
   0010's other reasons for json-render (declarative dialog
   shape, validation, repeat scopes) still apply and would be
   wasted.

## Decision

Adopt **alternative 2**.

### Mount changes

- `models-config` retires its `dock:overlays` contribution.
- `models-config` contributes two `settings:tabs` entries:
  - `models-config:connections` — "Models & Connections" tab
    (4 type-sub-tabs).
  - `models-config:local` — "Local Models" tab.
- Each tab body is a json-render spec hosted by a
  `ModelsConfigSettingsTab` React host (in
  `models-config-react`) that owns its own `StateStore` and the
  same renderer-side bridge from `Providers` / `LocalModels`
  adapters that ADR 0010 specified.
- The `models-config` catalog (shadcn + `Markdown` primitive)
  is unchanged.

### Commands

- `manage-remote-connections` (v4 draft) is retired.
- `manage-local-models` (v4 draft) is retired.
- A new `configure-models { typeHint?: ConnectionType }`
  command opens Settings on the Models & Connections tab,
  focusing the matching type-sub-tab when `typeHint` is
  supplied.
- `select-model { connectionId, modelId }` semantics change
  from "open the Models List dialog" to "set the current
  session's `modelRef`" (per session-level model selection in
  CONTEXT.md).

### Discoverability path

The composer dropdown's last entry — always present, regardless
of starred state — is "Configure models…". It fires
`configure-models` with `typeHint` derived from the current
session's model (if any). Settings opens on the right tab and
sub-tab. From there the user stars more models; on dialog
close, the dropdown reflects the new starred set; the user
picks. Two clicks from chat to "I have a new model available",
which matches ADR 0010's `dock:overlays` flow.

### What this does NOT change from ADR 0010

- json-render as the declarative substrate.
- The shadcn catalog + `Markdown` primitive.
- The two-segment `/persistent` + `/ui` state model and the
  renderer-side adapter bridge.
- `ai-providers-react` removal (its two contributions remain
  subsumed by the new design).

## Consequences

- **One mount surface for model management.** Settings is the
  configuration home; `dock:overlays` carries only genuinely
  modal cross-cutting affordances (today, none from
  `models-config`).
- **No standalone Models List dialog.** Per-Connection model
  lists with checkboxes (inside each type-sub-tab) replace it.
  The composer dropdown is the only cross-connection model
  view, and that's enough because selection is its job anyway.
- **`settings:tabs` is the entry point.** Existing
  `SettingsTab` slot contributions get two siblings;
  `settings-react` doesn't change.
- **Spec layout shifts from "three Dialog elements" to "two
  tab bodies".** Mechanical refactor in `models-config/src/public/spec.ts`;
  no new substrate.

## Why this is hard to reverse

Once Settings hosts the tabs and the composer's "Configure
models…" routes through `configure-models`, reverting would
require: (a) re-establishing `dock:overlays` mounts, (b)
re-introducing `manage-remote-connections` / `manage-local-models`,
(c) re-splitting the spec into separate Dialog elements, (d)
deciding what (if anything) the Settings tab does in the
reverted world (an empty shell? a button-launcher?). The
forward direction is the simpler shape — one mount surface for
configuration. Returning to ADR 0010's split would re-introduce
the multi-mount complexity that this ADR collapses.

This ADR therefore commits the app to **Settings = the home of
all configuration UI**, including model management, with
`dock:overlays` reserved for genuinely modal cross-cutting
affordances.
