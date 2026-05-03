import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/contexts/workspace-context";

/**
 * Compact banner shown at the top of the shell when a stored handle has
 * `prompt` permission. Triggers `requestPermission()` from a user gesture.
 */
export function ReconnectBanner(): React.ReactElement | null {
  const { state, reconnect } = useWorkspace();
  if (state.status !== "needs-permission") return null;
  return (
    <div className="flex items-center gap-3 border-b bg-muted px-4 py-2 text-sm">
      <span className="flex-1">
        Reconnect to workspace{" "}
        <span className="font-medium text-foreground">{state.label}</span>?
      </span>
      <Button size="sm" onClick={reconnect}>
        <RefreshCw /> Reconnect
      </Button>
    </div>
  );
}
