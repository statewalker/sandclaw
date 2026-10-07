import {
  Button,
  cn,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@statewalker/ui.view.shadcn";
import { Lock, RefreshCw } from "lucide-react";
import { officeMachine } from "../mock.js";

/** State of the encrypted peer-to-peer link between this browser and the office machine. */
export type LinkState = "connected" | "connecting" | "offline";

const labels: Record<LinkState, string> = {
  connected: "Connected",
  connecting: "Connecting…",
  offline: "Office machine offline",
};

const dotColor: Record<LinkState, string> = {
  connected: "bg-success",
  connecting: "bg-warning animate-pulse",
  offline: "bg-destructive",
};

function Dot({ state }: { state: LinkState }) {
  return <span className={cn("inline-block size-2 rounded-full", dotColor[state])} />;
}

/** A frame that stands in for the app's top bar, so the indicators are seen in place. */
function TopBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-12 items-center justify-between border-b px-4">
      <span className="text-sm font-semibold">Sandclaw</span>
      {children}
    </div>
  );
}

/** Variant A: a quiet dot in the top bar; details on hover. */
export function StatusDot({ state }: { state: LinkState }) {
  return (
    <TopBar>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 text-xs"
              aria-label={labels[state]}
            >
              <Dot state={state} />
              <span className="text-muted-foreground">{officeMachine.name}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>{labels[state]} · end-to-end encrypted</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </TopBar>
  );
}

/** Variant B: a pill that is silent when healthy and turns into an action when not. */
export function StatusPill({ state }: { state: LinkState }) {
  return (
    <TopBar>
      {state === "offline" ? (
        <Button variant="outline" size="sm" className="text-destructive">
          <Dot state={state} /> {labels[state]} <RefreshCw />
        </Button>
      ) : (
        <span className="bg-secondary flex items-center gap-2 rounded-full px-3 py-1 text-xs">
          <Lock className="size-3" /> {labels[state]}
        </span>
      )}
    </TopBar>
  );
}

/** Variant C: a full-width banner, only when the link is not healthy. */
export function StatusBanner({ state }: { state: LinkState }) {
  return (
    <div>
      <TopBar>
        <span />
      </TopBar>
      {state !== "connected" && (
        <div className="m-4 flex items-center gap-3 rounded-md border px-4 py-3 text-sm">
          <Dot state={state} />
          <span className="flex-1">
            {state === "offline"
              ? `${officeMachine.name} is not answering. Your chats are safe in this browser; new questions will wait.`
              : `Reconnecting to ${officeMachine.name}…`}
          </span>
          {state === "offline" && (
            <Button size="sm" variant="outline">
              Retry
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
