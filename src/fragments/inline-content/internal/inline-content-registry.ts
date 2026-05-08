import type { ComponentType } from "react";
import { IdentifiableRegistry } from "@/lib/identifiable-registry";

/**
 * Generic shape of an inline content component. Concrete components
 * cast `props` to their specific shape internally; the registry
 * holds them opaquely.
 */
export type InlineContentComponent = ComponentType<{ props: unknown }>;

/**
 * Workspace adapter holding inline-content components by id.
 * Same id-keyed semantics as `ViewRegistry` and `CatalogRegistry`,
 * inherited from the shared `IdentifiableRegistry` primitive.
 */
export class InlineContentRegistry extends IdentifiableRegistry<InlineContentComponent> {}
