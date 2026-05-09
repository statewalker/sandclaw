import { IdentifiableRegistry } from "@/fragments/core-views";

/**
 * Workspace adapter holding json-render catalogs by id.
 *
 * Stores the bound json-render registry (`defineRegistry(...).registry`)
 * directly — `<JsonPanel>` reads it back to power `<Renderer>`. The
 * value is typed as `unknown` because the registry is held opaquely
 * (json-render's types stay at the rendering boundary, not in this
 * adapter's surface).
 *
 * Same id-keyed semantics as `ViewRegistry` and
 * `InlineContentRegistry`, inherited from the shared
 * `IdentifiableRegistry` primitive.
 */
export class CatalogRegistry extends IdentifiableRegistry<unknown> {}
