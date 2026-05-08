export {
  type InlineContentComponent,
  InlineContentRegistry,
} from "./internal/inline-content-registry.js";
export {
  observeInlineComponents,
  provideInlineComponent,
} from "./public/extension-points.js";
export { initInlineContent as default } from "./public/init-inline-content.js";
export type {
  InlineComponentDescriptor,
  InlineContentSpec,
} from "./public/types.js";
