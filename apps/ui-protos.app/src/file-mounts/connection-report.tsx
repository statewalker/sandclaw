import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@statewalker/ui.view.shadcn";
import { Check, ChevronDown, Circle, Loader2, Minus, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { Problem } from "../file-panels/problem.js";
import { CHECK_LABELS, CHECK_ORDER, type ConnectionReport } from "./connection-test.js";
import type { CheckId } from "./s3-problems.js";

type CheckState = ConnectionReport["checks"][number]["state"] | "running";

const ICONS: Record<CheckState, { icon: typeof Check; className: string; said: string }> = {
  ok: { icon: Check, className: "text-green-600", said: "passed" },
  failed: { icon: X, className: "text-destructive", said: "failed" },
  skipped: { icon: Minus, className: "text-muted-foreground", said: "skipped" },
  "not-run": { icon: Circle, className: "text-muted-foreground/50", said: "not run" },
  running: { icon: Loader2, className: "animate-spin text-muted-foreground", said: "running" },
};

/** A problem in plain words, its raw detail under "Details", and for CORS the rule to copy. */
export function ProblemView({ problem }: { problem: Problem }) {
  const [copied, setCopied] = useState<"copied" | "failed">();
  const fix = problem.fix;
  const copy = (json: string) =>
    // No clipboard (an insecure page) throws here; a refusal rejects: both say so.
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(json))
      .then(
        () => setCopied("copied"),
        () => setCopied("failed"),
      );
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(undefined), 3000);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <div className="grid min-w-0 gap-2 text-sm">
      <p className="text-destructive">{problem.message}</p>
      {fix ? (
        <div className="grid min-w-0 gap-2">
          <pre className="max-h-60 overflow-auto rounded-md bg-muted p-2 text-xs">{fix.json}</pre>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => copy(fix.json)}>
              {copied === "copied" ? "Copied" : "Copy rule"}
            </Button>
            {copied === "failed" ? (
              <span className="text-destructive text-xs">Couldn't copy.</span>
            ) : null}
          </div>
        </div>
      ) : null}
      {problem.detail ? (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-1 text-muted-foreground text-xs">
            Details <ChevronDown className="size-3" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <p className="break-all font-mono text-muted-foreground text-xs">{problem.detail}</p>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}

/** The five checks, with a tick, cross, dash or spinner each; `running` is the check under way. */
export function ConnectionReportView({
  report,
  running,
}: {
  report?: ConnectionReport;
  running?: CheckId;
}) {
  const runningAt = running ? CHECK_ORDER.indexOf(running) : -1;
  const stateOf = (id: CheckId, i: number): CheckState => {
    if (report) return report.checks.find((c) => c.id === id)?.state ?? "not-run";
    if (i < runningAt) return "ok";
    return i === runningAt ? "running" : "not-run";
  };
  return (
    <div className="grid min-w-0 gap-3 rounded-md border p-3">
      <ul className="grid gap-1.5 text-sm">
        {CHECK_ORDER.map((id, i) => {
          const { icon: Icon, className, said } = ICONS[stateOf(id, i)];
          return (
            <li key={id} className="flex items-center gap-2">
              <Icon aria-hidden className={`size-4 shrink-0 ${className}`} />
              <span>
                {CHECK_LABELS[id]}
                <span className="sr-only">: {said}</span>
              </span>
            </li>
          );
        })}
      </ul>
      {report?.ok ? <p className="text-green-700 text-sm">Every check passed.</p> : null}
      {report?.problem ? <ProblemView problem={report.problem} /> : null}
    </div>
  );
}
