import type { SessionState } from "@statewalker/ai-agent.core/state";
import { useNodeChildren } from "./hooks/use-session-node.js";
import { TurnView } from "./turn-view";

export function SessionView({
  session,
}: {
  session: SessionState;
}): React.ReactElement {
  useNodeChildren(session);
  const turns = session.turns;
  if (turns.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        Send a message to start the conversation.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6 p-6">
      {turns.map((turn) => (
        <TurnView key={turn.id} turn={turn} />
      ))}
    </div>
  );
}
