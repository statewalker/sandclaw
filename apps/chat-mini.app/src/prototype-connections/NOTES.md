# Prototype — Model-connections settings redesign

**Throwaway.** Delete this folder and the `main.tsx` gate once a direction is chosen.

## Question being answered

What layout / information architecture should the redesigned "AI model connections"
settings panel use? The current panel is broken on four axes: layout/IA, the
connect/test feedback, visual polish, and state sync. This prototype explores
**layout only** against realistic mock data, so we can pick a direction before
re-authoring the real `models-config` JsonRender spec + catalog.

## How to run

```bash
pnpm --filter @statewalker/chat-mini-app dev
```

Then open: <http://localhost:3460/?prototype=connections&variant=A>

Switch variants with the floating bar at the bottom, the ←/→ keys, or `?variant=`.

To exercise every test-feedback state:
- **Success**: open the `Local Ollama` (or `Google`) connection and hit Test.
- **Loading**: watch the ~900ms spinner during any test.
- **Error**: put `fail` or `bad` in any API key and Test, or test Anthropic with no URL.
- **Connected**: `OpenAI` / `Anthropic` start connected with discovered models.

## The four variants

| Key | Name | IA / primary affordance |
|-----|------|-------------------------|
| A | Provider tabs (**chosen**) | One tab per connection; a "New connection" type-picker on the right of the tab bar spawns a new tab. Each sub-panel = a collapsible credential form (auto-folds once connected) above the discovered-model list. Maps cleanly onto the Tabs element already in the JsonRender catalog. |
| B | Type accordion | One collapsible section per provider type; rows expand inline to configure + test. Everything in one column. |
| C | Card grid + dialog | Dashboard of status cards; configure in a modal; add via a type-picker dialog. Overview-first. |
| D | Guided wizard | Linear stepper: provider → credentials → test → models. Dedicated test step with big states. Best for first-time setup. |

All four share the credential form, status badge, capability tags, and star toggle
(the atoms) — they disagree only on layout.

## Verdict

_TBD — fill in which variant (or hybrid, e.g. "C's overview + D's test step") won and why,_
_then delete the losers and fold the winner into `models-config` / `models-config-react`._

## When folding the winner into the real code

This is throwaway React. The real implementation must be expressed as a JsonRender
**spec + catalog** (see `workspaces/statewalker-ai/packages/models-config/src/public/connections-tab-spec.ts`
and `models-config-react/.../build-react-catalog.tsx`), reusing the existing
`@statewalker/ai-providers` domain (`Connection`, `listConnectionModels`, connect/check/disconnect
action handlers). Do **not** promote this prototype code directly.
