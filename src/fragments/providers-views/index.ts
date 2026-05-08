/**
 * Renderer fragment for `providers/`. The settings tab is wired
 * through `settings:tabs` slot + `ViewRegistry` (slot pattern C):
 * see `init-providers-views.ts`. `ProviderConfigGate` is still
 * named-exported because the chat surface renders it directly as
 * a full-pane empty-state until the chat surface deepening lands
 * in Wave 7.
 */
export { ActiveModelPicker } from "./internal/active-model-picker.js";
export { ProviderConfigGate } from "./internal/provider-config-gate.js";
export { ProviderConfigPanel } from "./internal/provider-config-panel.js";
export { initProvidersViews as default } from "./public/init-providers-views.js";
