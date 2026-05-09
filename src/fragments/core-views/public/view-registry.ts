import type { ComponentType } from "react";
import { IdentifiableRegistry } from "../internal/identifiable-registry.js";

/**
 * Generic shape of a view component registered in `ViewRegistry`.
 * Concrete components may take richer prop types; the registry
 * holds them opaquely (consumers cast at usage time, the same way
 * `CatalogRegistry` holds json-render registries opaquely).
 */
export type ViewComponent = ComponentType<unknown>;

/**
 * Workspace adapter holding React components by string viewKey.
 * The registration surface for slot pattern C (per ADR 0002 §6.4):
 * logic fragments contribute `{ id, viewKey }` slot values; the
 * paired renderer fragments register the React component for that
 * viewKey here. The slot consumer (e.g. composer, turn-view)
 * resolves a viewKey via `ViewRegistry.get` and renders the
 * returned component.
 *
 * ViewKey naming: `<owning-logic-fragment-id>:<purpose>` —
 * e.g. `chat:turn-block:tool-call`, `providers:model-picker`.
 *
 * The id-keyed semantics (throws on duplicate id with different
 * component, primary access pattern is `get(id)`) come from the
 * shared `IdentifiableRegistry` primitive — same shape as
 * `CatalogRegistry` and `InlineContentRegistry`.
 */
export class ViewRegistry extends IdentifiableRegistry<ViewComponent> {}
