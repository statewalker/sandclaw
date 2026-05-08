/**
 * One entry in the workspace's catalog registry. Holds the json-render
 * triple — declaration, components, and the bound registry that
 * `<Renderer>` consumes — for a single named catalog (e.g.
 * `"files-explorer"`, `"markdown-viewer"`, `"chat"`).
 *
 * Fields are typed as `unknown` because the registry doesn't
 * introspect json-render's shapes; consumers cast at usage time.
 * Decoupling from `@json-render/*` types here means a json-render
 * upgrade doesn't ripple through the registry. `components` is
 * also `unknown`-valued so this type stays free of React imports
 * (logic-fragment constraint per ADR 0002); the React renderer
 * fragment that builds the entry casts at construction time.
 */
export interface CatalogEntry {
  /** Result of `defineCatalog(schema, { components, actions })`. */
  catalog: unknown;
  /** Map of component name → React component, as passed to `defineRegistry`. */
  components: Record<string, unknown>;
  /** Result of `defineRegistry(catalog, { components }).registry`. */
  registry: unknown;
}
