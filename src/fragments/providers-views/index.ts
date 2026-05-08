/**
 * Renderer fragment for `providers/`. Bindings:
 *   - `settings:tabs` -> `ProviderConfigPanel` (settings dialog tab).
 *   - `chat:composer-actions` -> `ComposerModelPicker`.
 * Both are wired through `ViewRegistry` in `init-providers-views.ts`
 * (slot pattern C). `ProviderConfigGate` stays named-exported
 * because the chat surface renders it directly as a full-pane
 * empty-state from `chat-views/internal/chat-root.tsx`.
 */
export { ProviderConfigGate } from "./internal/provider-config-gate.js";
export { initProvidersViews as default } from "./public/init-providers-views.js";
