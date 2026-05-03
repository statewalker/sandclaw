import { Plus } from "lucide-react";
import { useCallback } from "react";
import { SessionRow } from "@/components/panels/session-row";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useActiveSession } from "@/contexts/active-session-context";
import { useRuntime } from "@/contexts/runtime-context";
import {
  useInvalidateSessions,
  useSessionList,
} from "@/hooks/use-session-list";

export function SessionsPanel(): React.ReactElement {
  const { state } = useRuntime();
  const { data, isLoading } = useSessionList();
  const invalidate = useInvalidateSessions();
  const { sessionId, open, createNew, clear } = useActiveSession();

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
      await state.runtime.deleteSession(id);
      invalidate();
      if (sessionId === id) clear();
    },
    [state, invalidate, sessionId, clear],
  );

  const isReady = state.status === "ready";

  return (
    <aside className="flex h-full w-full flex-col border-r bg-background">
      <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <h2 className="text-sm font-semibold">Sessions</h2>
        <Button
          size="sm"
          variant="outline"
          onClick={createNew}
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
                selected={sessionId === row.id}
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
