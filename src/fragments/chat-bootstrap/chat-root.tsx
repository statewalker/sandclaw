import type { ReactElement } from "react";
import { ChatPanel } from "@/components/panels/chat-panel";
import { ProviderConfigGate } from "@/components/providers/provider-config-gate";
import { useRuntime } from "@/contexts/runtime-context";

/**
 * Chat panel root component (Option β from
 * notes/2026-05/2026-05-06/03.dockview-json-render-intents-vision.md §3.6).
 *
 * The chat panel's json-render spec is exactly one element of type
 * `ChatRoot`; this component is what that element resolves to.
 * Internally it renders the existing `<ProviderConfigGate>` /
 * `<ChatPanel>` gating tree — same imperative React subtree the
 * pre-DockView MainShell mounts. No behavior change to the chat
 * session UI.
 */
export function ChatRoot(): ReactElement {
  const { state } = useRuntime();
  const showGate =
    state.status === "no-providers" || state.status === "no-active-model";
  return showGate ? <ProviderConfigGate /> : <ChatPanel />;
}
