import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  cn,
} from "@statewalker/ui.view.shadcn";
import { Laptop } from "lucide-react";
import { type Progress, type Site, type SiteState, siteState, stateText } from "./site-model.js";

const dot: Record<SiteState, string> = {
  generating: "bg-primary animate-pulse",
  stopped: "bg-muted-foreground",
  failed: "bg-destructive",
  stale: "bg-warning",
  "up-to-date": "bg-success",
};

export function StateDot({ state }: { state: SiteState }) {
  return <span className={cn("size-2 shrink-0 rounded-full", dot[state])} />;
}

export function StateTag({ site }: { site: Site }) {
  return (
    <span className="bg-secondary inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs">
      <StateDot state={siteState(site)} />
      {stateText(site)}
    </span>
  );
}

/** The site is built and kept on this peer only; said plainly wherever a site shows. */
export function OnlyHere() {
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
      <Laptop className="size-3.5" /> Only on this computer
    </span>
  );
}

/** Written pages, failed ones, and the rest — the indexing bar's idiom. */
export function ProgressBar({ progress, className }: { progress: Progress; className?: string }) {
  const pct = (n: number) => `${progress.total ? (100 * n) / progress.total : 0}%`;
  return (
    <div className={cn("bg-muted flex h-1.5 overflow-hidden rounded-full", className)}>
      <div className="bg-primary h-full" style={{ width: pct(progress.done) }} />
      <div className="bg-destructive h-full" style={{ width: pct(progress.failed) }} />
    </div>
  );
}

/** Regenerating every page takes minutes of the AI model's time, so it asks first. */
export function ConfirmRegenerate({
  site,
  open,
  onOpenChange,
  onConfirm,
}: {
  site?: Site;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const n = site?.pages.length ?? 0;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Regenerate all {n} pages of “{site?.name}”?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This takes about {n} minutes, on this computer, with this browser open. The current
            pages stay readable until each new one is written.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Regenerate</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
