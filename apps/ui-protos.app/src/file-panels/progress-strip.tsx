import { Button } from "@statewalker/ui.view.shadcn";
import { basename } from "@statewalker/webrun-files";
import { formatBytes } from "../browser-data/storage.js";
import type { TransferOp } from "./transfer-plan.js";
import type { TransferProgress, TransferResult } from "./transfer-run.js";

/** The bottom strip: a running transfer with Cancel, then its summary with Close. */
export function ProgressStrip({
  op = "copy",
  progress,
  result,
  onCancel,
  onClose,
}: {
  op?: TransferOp;
  progress?: TransferProgress;
  result?: TransferResult;
  onCancel(): void;
  onClose(): void;
}) {
  if (result) {
    const total = result.done.length + result.failed.length + result.skipped.length;
    const head = result.cancelled
      ? "Cancelled"
      : result.failed.length
        ? `${result.failed.length} of ${total} failed`
        : "Done";
    return (
      <div role="status" className="grid gap-1 rounded-md border bg-background p-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="font-medium">{head}</span>
          {result.skipped.length ? (
            <span className="text-muted-foreground">{result.skipped.length} skipped</span>
          ) : null}
          <Button variant="ghost" size="sm" className="ml-auto" onClick={onClose}>
            Close
          </Button>
        </div>
        {result.failed.length ? (
          <ul className="grid gap-0.5 text-destructive">
            {result.failed.map((f) => (
              <li key={f.path} className="break-words">
                <span className="font-medium">{basename(f.path)}</span>: {f.problem.message}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  const percent = progress?.bytesTotal
    ? Math.round((progress.bytesDone / progress.bytesTotal) * 100)
    : 0;
  return (
    <div role="status" className="grid gap-1 rounded-md border bg-background p-2 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate">
          {progress
            ? `${op === "move" ? "Moving" : "Copying"} ${basename(progress.file)}`
            : "Preparing…"}
        </span>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <div
        role="progressbar"
        aria-label="Transfer progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      {progress ? (
        <span className="text-xs text-muted-foreground">
          {formatBytes(progress.bytesDone)} of {formatBytes(progress.bytesTotal)} ·{" "}
          {progress.itemsDone} of {progress.itemsTotal} items
        </span>
      ) : null}
    </div>
  );
}
