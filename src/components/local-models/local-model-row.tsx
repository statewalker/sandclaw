import type {
  ActivationProgress,
  LocalModelConfig,
  ModelStatus,
} from "@statewalker/ai-agent/models";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface LocalModelRowProps {
  catalogKey: string;
  config: LocalModelConfig;
  status: ModelStatus;
  error?: Error;
  /** Set when this row is the one currently being activated. */
  activatingProgress: ActivationProgress | null;
  isActive: boolean;
  onActivate: (key: string) => void;
  onCancel: () => void;
  onDelete: (key: string) => void;
}

function statusLabel(
  status: ModelStatus,
  isActive: boolean,
  progress: ActivationProgress | null,
): string {
  if (isActive) return "Active";
  if (progress) {
    const pct =
      progress.progress != null
        ? ` ${Math.round(progress.progress * 100)}%`
        : "";
    if (progress.phase === "downloading") return `Downloading${pct}`;
    if (progress.phase === "loading") return `Loading${pct}`;
    if (progress.phase === "warming") return "Warming up";
    if (progress.phase === "checking") return "Checking storage";
    if (progress.phase === "verifying") return "Verifying";
  }
  switch (status) {
    case "not-downloaded":
      return "Not downloaded";
    case "downloading":
      return "Downloading";
    case "partial":
      return "Partial download";
    case "downloaded":
      return "Downloaded";
    case "loading":
      return "Loading";
    case "ready":
      return "Ready";
    case "error":
      return "Error";
    default:
      return status;
  }
}

export function LocalModelRow({
  catalogKey,
  config,
  status,
  error,
  activatingProgress,
  isActive,
  onActivate,
  onCancel,
  onDelete,
}: LocalModelRowProps): React.ReactElement {
  const isWorking = activatingProgress !== null;
  const downloaded = status === "downloaded" || status === "ready";
  const action = isWorking
    ? "Cancel"
    : status === "error"
      ? "Retry"
      : downloaded
        ? "Activate"
        : "Download & Activate";
  const label = statusLabel(status, isActive, activatingProgress);

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium">{config.label}</div>
          <div className="text-xs text-muted-foreground truncate">
            {config.modelId} · {config.size ?? "?"} · {config.dtype ?? ""}
          </div>
        </div>
        <div
          className={
            status === "error"
              ? "text-xs font-medium text-destructive whitespace-nowrap"
              : isActive
                ? "text-xs font-medium text-green-600 dark:text-green-500 whitespace-nowrap"
                : "text-xs font-medium text-muted-foreground whitespace-nowrap"
          }
        >
          {label}
        </div>
      </div>

      {activatingProgress &&
      activatingProgress.progress != null &&
      (activatingProgress.phase === "downloading" ||
        activatingProgress.phase === "loading") ? (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{
              width: `${Math.round(activatingProgress.progress * 100)}%`,
            }}
          />
        </div>
      ) : null}

      {error ? (
        <p className="text-xs text-destructive">{error.message}</p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={isWorking ? "outline" : "default"}
          onClick={() => (isWorking ? onCancel() : onActivate(catalogKey))}
          disabled={isActive && !isWorking}
        >
          {isWorking ? <Loader2 className="animate-spin" /> : null}
          {action}
        </Button>
        {downloaded && !isActive && !isWorking ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto text-destructive"
            onClick={() => onDelete(catalogKey)}
          >
            <Trash2 /> Remove weights
          </Button>
        ) : null}
      </div>
    </div>
  );
}
