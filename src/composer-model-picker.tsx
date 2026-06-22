import { useChatPanelContext } from "@repo/chat-mini.chat-react";
import { AgentRuntimeAdapter } from "@statewalker/ai-agent-runtime.core";
import { AiConfig, ConfigureAiCommand } from "@statewalker/ai-config.core";
import { Commands } from "@statewalker/shared-commands";
import { useAdapter, useAdapterValue, useAppWorkspace } from "@statewalker/ui.view.react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@statewalker/ui.view.shadcn";
import { type ReactElement, useEffect, useMemo, useState } from "react";
import { buildChoices, isModelRefValid } from "./composer-model-ref-validity.js";

const NO_MODELS = "__no-models__";
const CONFIGURE = "__configure__";

/**
 * Compact session-level model picker in the chat composer. Reads connections +
 * the active selection from `AiConfig` (the unified source of truth) and the
 * per-session `modelRef`. Selecting a model writes `AiConfig.setActive` (which
 * the chat-app projection mirrors into `ActiveModel`, driving the runtime) and
 * the session's `modelRef`.
 *
 * Lives in the chat app — it composes `useChatPanelContext` (app session
 * context) with `AiConfig` (workbench config). This is the canonical home for
 * the composer picker; it replaces the former `models-config.view.react`
 * picker, which imported the chat app from the workbench (an inverted
 * dependency).
 */
export function ComposerModelPicker(): ReactElement {
  const workspace = useAppWorkspace();
  const commands = useAdapter(Commands);
  const panelCtx = useChatPanelContext();
  const sessionId = panelCtx?.sessionId;

  const connections = useAdapterValue(AiConfig, (c) => c.listConnections());
  const activeSel = useAdapterValue(AiConfig, (c) => c.getActive());

  // Async load of session metadata; re-validated against `connections` on
  // every render, so it only re-fetches when the session id changes.
  const [sessionRef, setSessionRef] = useState<
    { connectionId: string; modelId: string } | null | undefined
  >(undefined);
  useEffect(() => {
    if (!sessionId) {
      setSessionRef(null);
      return;
    }
    const runtimeState = workspace.requireAdapter(AgentRuntimeAdapter).getState();
    if (runtimeState.status !== "ready") return;
    let cancelled = false;
    void runtimeState.runtime.getSessionMetadata(sessionId).then((meta) => {
      if (cancelled) return;
      setSessionRef(meta?.modelRef ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId, workspace]);

  const choices = useMemo(() => buildChoices(connections), [connections]);
  const refValid = isModelRefValid(connections, sessionRef ?? undefined);

  // Trigger value: session modelRef if valid, else the AiConfig active
  // selection if valid, else placeholder.
  const hintRef =
    activeSel.connectionId && activeSel.modelId
      ? { connectionId: activeSel.connectionId, modelId: activeSel.modelId }
      : undefined;
  const triggerRef = refValid
    ? (sessionRef as { connectionId: string; modelId: string })
    : isModelRefValid(connections, hintRef)
      ? (hintRef as { connectionId: string; modelId: string })
      : null;
  const triggerValue = triggerRef ? `${triggerRef.connectionId}::${triggerRef.modelId}` : "";

  const showRecovery = sessionRef != null && !refValid;

  // No connections at all → loud CTA to open the AI-config settings tab.
  if (connections.length === 0) {
    return (
      <button
        type="button"
        className="rounded-md border border-primary bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20"
        onClick={() => {
          void commands.call(ConfigureAiCommand, undefined);
        }}
      >
        Configure models…
      </button>
    );
  }

  const handleSelect = (next: string): void => {
    if (next === CONFIGURE) {
      void commands.call(ConfigureAiCommand, undefined);
      return;
    }
    if (next === NO_MODELS) return;
    const [connectionId, modelId] = next.split("::");
    if (!connectionId || !modelId) return;

    // Set the AiConfig active selection — the chat-app projection mirrors it
    // into `ActiveModel`, which the agent runtime builds against.
    void workspace.requireAdapter(AiConfig).setActive(connectionId, modelId);

    // Per-session ref.
    if (sessionId) {
      const runtimeState = workspace.requireAdapter(AgentRuntimeAdapter).getState();
      if (runtimeState.status === "ready") {
        void runtimeState.runtime
          .setSessionModelRef(sessionId, { connectionId, modelId })
          .then(() => {
            setSessionRef({ connectionId, modelId });
          });
      }
    }
  };

  return (
    <div className="flex flex-col gap-1">
      {showRecovery ? (
        <p className="px-2 text-xs text-amber-700 dark:text-amber-400">
          Previous model is no longer available — pick another.
        </p>
      ) : null}
      <Select value={triggerValue || NO_MODELS} onValueChange={handleSelect}>
        <SelectTrigger className="h-8 min-w-[10rem] border-0 bg-transparent px-2 text-xs hover:bg-accent">
          <SelectValue placeholder="Pick a model…" />
        </SelectTrigger>
        <SelectContent>
          {choices.length === 0 ? (
            <SelectItem value={NO_MODELS} disabled>
              <span className="text-xs text-muted-foreground">No chat-capable starred models</span>
            </SelectItem>
          ) : (
            choices.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                <span className="font-medium">{c.label}</span>
                <span className="ml-2 text-xs text-muted-foreground">{c.providerLabel}</span>
              </SelectItem>
            ))
          )}
          <SelectItem value={CONFIGURE}>
            <span className="text-xs text-muted-foreground">Configure models…</span>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
