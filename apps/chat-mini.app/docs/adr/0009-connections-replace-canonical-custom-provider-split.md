# ADR 0009 — Connections replace the canonical / custom provider split

Date: 2026-05-15
Status: accepted

## Context

`ai-providers` stores remote-provider config in `providers.json`
with a structural split:

- `remote: { openai?, anthropic?, google? }` — canonical
  first-party SDK providers, one record per type, payload is
  `{ apiKey }`.
- `custom: CustomProvider[]` — user-defined OpenAI-compatible
  endpoints, each with `{ id, name, baseURL, apiKey }`.

Two consequences of the split:

1. **One record per canonical type.** A user with two OpenAI
   accounts (work + personal) cannot register both — the
   `remote.openai` slot only holds one. The split treats
   "canonical-ness" as a per-type singleton property, which is an
   implementation accident, not a domain truth.
2. **Two storage shapes for the same domain concept.** The
   "remote endpoint" idea exists in two places under different
   shapes (`remote.{name}` and `custom[]`), and code paths
   ramify: `listConfiguredProviders` walks both;
   `buildDescriptors` has two branches; `migrateFromV2` had to
   move things between shapes once already.

The new model-management surface (see CONTEXT.md "Models and
connections") presents a single **Add Connection** dialog with a
`type` dropdown, implying that "Connection" is the domain
concept and the split is just an implementation leak. Adding
`headers?` (a v4 requirement) under the existing split would
mean adding it in two places, deepening the leak.

`active.providerId` already addresses both shapes uniformly: for
canonical entries it carries the type name (`"openai"`), for
custom entries it carries the custom id. That's the migration
hint — canonical types are already idable.

## Alternatives considered

1. **Keep the split; add `headers` in both places.** Smallest
   change. Doesn't fix the singleton-per-canonical-type
   restriction; doesn't unify the form UX; locks the implementation
   shape into the schema for one more version.
2. **Keep the split; allow multi-canonical via an inner list
   (`remote.openai: CanonicalCredentials[]`).** Resolves the
   multi-account issue but compounds the asymmetry (canonical is
   `Record<name, Cred[]>`, custom is `Custom[]`). The form UX
   still has to special-case canonical vs custom because
   payloads diverge.
3. **Unified `connections: Connection[]`, deterministic ids for
   migration (this ADR).** One shape, one form UX, multi-account
   support, headers in one place, `ActiveModel.providerId`
   semantics preserved by migration.

## Decision

Adopt **alternative 3**.

### Storage shape (v4)

```ts
type ConnectionType =
  | "openai"
  | "anthropic"
  | "google"
  | "openai-compatible";
  // future: "azure-openai", "cohere", …

interface Connection {
  id: string;
  type: ConnectionType;
  name: string;            // display label
  url?: string;            // required for openai-compatible; optional otherwise (proxy override)
  apiKey: string;
  headers?: { name: string; value: string }[];
  discoveredModels?: DiscoveredModel[];
  discoveredAt?: number;
}
```

`ProvidersConfig` v4 replaces `remote` + `custom` with a single
`connections: Connection[]`. `active`, the v3 `local`, and the
new `starred` / `local.downloaded` fields are added alongside;
see CONTEXT.md for the full shape.

### Multi-instance per canonical type

Multiple Connections with the same canonical `type` are
permitted. Each produces its own `ProviderDescriptor`
contribution to `providers:remote`, identified by
`descriptor.id === connection.id`. The agent runtime's
existing pointer model (`ActiveModel.providerId` →
`descriptor.id`) generalises without change.

### Migration from v3

- For each populated canonical entry (`remote.openai`,
  `remote.anthropic`, `remote.google`), emit a Connection with
  `id === type` (literally `"openai"`, `"anthropic"`,
  `"google"`), `type` matching, and `name` set to the canonical
  display label. The deterministic id keeps any existing
  `active.providerId === "openai"` valid.
- For each entry in `custom[]`, emit a Connection with the
  existing custom `id`, `type: "openai-compatible"`, and
  `name` from the existing `name`.
- Drop the `remote` and `custom` keys. `ProvidersConfig.schemaVersion`
  becomes `4`.

Migration is one-way. There is no v4→v3 inverse — once a user
adds a second OpenAI Connection or a header, the split shape
cannot losslessly hold the state.

### Descriptor identity

`ProviderDescriptor.kind` remains a discriminator (`"canonical"`
vs `"custom"`) so existing consumers (e.g. icon resolution)
still differentiate; it is now derived from `connection.type`
rather than stored independently. `kind === "custom"` iff
`type === "openai-compatible"`.

### Form UX implication

The Add / Edit Connection form has a `type` dropdown and a
`headers` repeater. For canonical types the `url` field is
optional (used only when the user wants to point at a proxy);
for `openai-compatible` it is required. Validation lives in the
spec (json-render `checks`).

## Consequences

- **One form, one storage shape, one descriptor-build path.**
  `buildDescriptors` collapses to a single `connections.map(...)`
  loop. `listConfiguredProviders` retires.
- **Multi-account first-class.** Work / personal OpenAI keys
  coexist as two Connections; the model picker shows both with
  user-chosen names.
- **`headers` is a first-class field** for every Connection —
  the SDK adapters in `internal/builtins/*.ts` will forward them
  via `RemoteProviderSettings.headers`.
- **`OpenProviderConfigCommand` is removed.** The new
  `manage-remote-connections` command (declared by
  `models-config`) supersedes it.
- **One-time mechanical migration of `providers-store.ts`.** A
  `migrateFromV3` function runs once per workspace load; the
  v3→v4 path is covered by tests using fixtures already in
  `providers-store.test.ts`.
- **`ActiveModel` semantics preserved.** Existing user state
  (canonical providers selected pre-migration) keeps working
  without re-selection because canonical migrated ids are
  deterministic.

## Why this is hard to reverse

Once a user creates a second Connection with the same canonical
type or adds `headers`, the v3 shape cannot represent the state.
Reverting forces data loss (drop the second account; drop all
headers) or shape reinflation (re-introduce `custom[]` plus a
new `remote.openai: Cred[]` shape). Either way is an obvious
regression. The migration is one-way by design — the new shape
is the long-term home.
