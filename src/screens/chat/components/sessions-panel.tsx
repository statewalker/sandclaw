import { Intents } from "@statewalker/shared-intents";
import { Plus } from "lucide-react";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AgentRuntimeAdapter } from "@/fragments/agent-runtime";
import { chatPanelId, runOpenChatSession } from "@/fragments/chat";
import { useFocusedChatTab, useOpenChatTabs } from "@/fragments/chat-views";
import { runClosePanel } from "@/fragments/dock";
import { useAppWorkspace } from "@/fragments/workspace-bridge-views";
import { useAdapterValue } from "@/lib/use-adapter-value";
import {
  useInvalidateSessions,
  useSessionList,
} from "@/screens/chat/hooks/use-session-list";
import { SessionRow } from "./session-row";

export function SessionsPanel(): React.ReactElement {
  const state = useAdapterValue(AgentRuntimeAdapter, (a) => a.getState());
  const workspace = useAppWorkspace();
  const intents = workspace.requireAdapter(Intents);
  const { data, isLoading } = useSessionList();
  const invalidate = useInvalidateSessions();
  const focusedSessionId = useFocusedChatTab();
  const openSessionIds = useOpenChatTabs();

  const open = useCallback(
    (id: string): void => {
      runOpenChatSession(intents, { sessionId: id });
    },
    [intents],
  );

  const createNew = useCallback(async (): Promise<void> => {
    if (state.status !== "ready") return;
    const session = state.agent.createSession();
    await session.save();
    invalidate();
    runOpenChatSession(intents, { sessionId: session.id });
  }, [state, invalidate, intents]);

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
      runClosePanel(intents, { panelId: chatPanelId(id) });
      await state.runtime.deleteSession(id);
      invalidate();
    },
    [state, invalidate, intents],
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
