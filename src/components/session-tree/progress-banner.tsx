import { TriangleAlert, Wrench } from "lucide-react";
import { Loader } from "@/components/prompt-kit/loader";
import { TextShimmer } from "@/components/prompt-kit/text-shimmer";
import type { SendProgress } from "@/hooks/use-send-message";

export function ProgressBanner({
  progress,
}: {
  progress: SendProgress;
}): React.ReactElement | null {
  if (!progress.running && !progress.lastError) return null;

  if (progress.lastError && !progress.running) {
    return (
      <div className="flex items-center gap-2 border-t bg-destructive/10 px-4 py-1.5 text-xs text-destructive">
        <TriangleAlert className="h-3.5 w-3.5" />
        {progress.lastError}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 border-t bg-muted/40 px-4 py-1.5 text-xs text-muted-foreground">
      {progress.currentTool ? (
        <>
          <Wrench className="h-3.5 w-3.5" />
          <span>
            Calling <span className="font-mono">{progress.currentTool}</span>…
          </span>
          <Loader variant="dots" size="sm" />
        </>
      ) : (
        <TextShimmer className="text-xs" duration={2}>
          Thinking…
        </TextShimmer>
      )}
    </div>
  );
}
