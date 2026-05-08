/**
 * Renderer fragment for `providers/`. Exposes the existing React
 * components by named export so chat-mini's shell can keep
 * referencing them directly. The slot-driven path lands in Waves
 * 4.3 (settings:tabs) and 7.1 (chat:composer-actions).
 */
export { ActiveModelPicker } from "./internal/active-model-picker.js";
export { ProviderConfigGate } from "./internal/provider-config-gate.js";
export { ProviderConfigPanel } from "./internal/provider-config-panel.js";
export { ProviderSettingsDialog } from "./internal/provider-settings-dialog.js";
export { initProvidersViews as default } from "./public/init-providers-views.js";
