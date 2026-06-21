import { chatPanelId, OpenChatSessionCommand } from "@repo/chat-mini.chat";
import { useFocusedChatTab, useOpenChatTabs } from "@repo/chat-mini.chat-react";
import {
  ActiveModel,
  AgentRuntimeAdapter,
} from "@statewalker/ai-agent-runtime.core";
import { useAdapterValue, useAppWorkspace } from "@statewalker/ui.view.react";
import { ClosePanelCommand } from "@statewalker/shell.core";
import { Button, ScrollArea } from "@statewalker/ui.view.shadcn";
import { Commands } from "@statewalker/shared-commands";
import { Plus } from "lucide-react";
import { useCallback } from "react";
import {
  useInvalidateSessions,
  useSessionList,
} from "./hooks/use-session-list.js";
import { SessionRow } from "./session-row";

export function SessionsPanel(): React.ReactElement {
  const state = useAdapterValue(AgentRuntimeAdapter, (a) => a.getState());
  const workspace = useAppWorkspace();
  const commands = workspace.requireAdapter(Commands);
  const { data, isLoading } = useSessionList();
  const invalidate = useInvalidateSessions();
  const focusedSessionId = useFocusedChatTab();
  const openSessionIds = useOpenChatTabs();

  const open = useCallback(
    (id: string): void => {
      commands.call(OpenChatSessionCommand, { sessionId: id });
    },
    [commands],
  );

  const createNew = useCallback(async (): Promise<void> => {
    if (state.status !== "ready") return;
    const session = state.agent.createSession();
    await session.save();
    // Inherit the workspace last-selected model as the new
    // session's per-session hint. The composer validates this on
    // mount and shows the recovery banner if the ref is no longer
    // valid (Connection disconnected, model un-starred).
    const hint = workspace.requireAdapter(ActiveModel).get();
    if (hint?.providerId && hint.modelId) {
      await state.runtime.setSessionModelRef(session.id, {
        connectionId: hint.providerId,
        modelId: hint.modelId,
      });
    }
    invalidate();
    commands.call(OpenChatSessionCommand, { sessionId: session.id });
  }, [state, invalidate, commands, workspace]);

  const onRename = useCallback(
    async (id: string, title: string): Promise<void> => {
      if (state.status !== "ready") return;
      const session = await state.runtime.loadSession(id);
      session.state.props.title = title;
      await session.save({ title });
      invalidate();
    },
    [state, invalidate],
  );

  const onDelete = useCallback(
    async (id: string): Promise<void> => {
      if (state.status !== "ready") return;
      // Close the tab first (if open) so its panel disappears
      // before the underlying session disk row is removed; the
      // dock fragment evicts the chat spec when the last referencing
      // panel closes (chat specs are persistent so eviction is
      // skipped — that's fine, the spec lingers harmlessly).
      commands.call(ClosePanelCommand, { panelId: chatPanelId(id) });
      await state.runtime.deleteSession(id);
      invalidate();
    },
    [state, invalidate, commands],
  );

  const isReady = state.status === "ready";

  return (
    <aside className="flex h-full w-full flex-col border-r bg-background">
      <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <h2 className="text-sm font-semibold">Sessions</h2>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void createNew()}
          disabled={!isReady}
        >
          <Plus className="h-4 w-4" /> New
        </Button>
      </header>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-0.5 p-2">
          {isLoading ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              Loading…
            </p>
          ) : !data || data.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              {isReady
                ? "No sessions yet. Click New to start one."
                : "Configure a provider to begin."}
            </p>
          ) : (
            data.map((row) => (
              <SessionRow
                key={row.id}
                id={row.id}
                title={row.title ?? ""}
                updatedAt={row.updatedAt}
                selected={focusedSessionId === row.id}
                open={openSessionIds.has(row.id)}
                onOpen={open}
                onRename={onRename}
                onDelete={onDelete}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
