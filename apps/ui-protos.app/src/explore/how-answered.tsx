import {
  Button,
  Card,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@statewalker/ui.view.shadcn";
import { ChevronDown, ChevronRight, Route, Search } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { GroundedAnswer } from "../ask/answers.js";
import { Citation, GroundedAnswerView } from "../ask/grounded-answer.js";
import { fileName, IndexTag, score } from "./explore.js";
import {
  type AnswerTrace,
  funnel,
  indexKinds,
  indexWords,
  type MergedResult,
  notFoundReason,
  passages,
  type QueryType,
  reranked,
  sectionOf,
  traceFor,
  type UnusedPassage,
  type UsedPassage,
} from "./explore-model.js";

/**
 * How the trace is laid out:
 * - `timeline`: the pipeline's steps in order, each opening to what it produced;
 * - `funnel`: one bar per stage, its count shrinking from results to citations.
 */
export type HowVariant = "timeline" | "funnel";

const queryWords: Record<QueryType, string> = {
  lex: "Key words",
  vec: "Meaning",
  hyde: "Like an answer",
};

const where = (r: { path: string; blockId: string }) => {
  const section = sectionOf(r.path, r.blockId);
  return `${fileName(r.path)}${section ? ` · ${section}` : ""}`;
};

const Score = ({ value, on }: { value: number; on: boolean }) =>
  on ? (
    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{score(value)}</span>
  ) : null;

// --- What each stage produced ---------------------------------------------------

function Rephrasings({ trace, scores }: { trace: AnswerTrace; scores: boolean }) {
  return (
    <ul className="grid gap-1 text-sm">
      {trace.expanded.map((q) => (
        <li key={q.query} className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className="text-muted-foreground w-28 shrink-0 text-xs">
            {queryWords[q.type]}
            {scores && ` (${q.type})`}
          </span>
          <span className="min-w-0">“{q.query}”</span>
        </li>
      ))}
    </ul>
  );
}

function PerIndex({ trace, scores }: { trace: AnswerTrace; scores: boolean }) {
  return (
    <div className="grid gap-3">
      {indexKinds.map((k) => (
        <section key={k} aria-label={`${indexWords[k].label} index`} className="min-w-0">
          <h4 className="text-sm font-medium">
            {indexWords[k].label}{" "}
            <span className="text-muted-foreground text-xs font-normal">
              — {indexWords[k].finds}
            </span>
          </h4>
          {trace.perIndex[k].length === 0 ? (
            <p className="text-muted-foreground text-xs italic">Returned nothing.</p>
          ) : (
            <ol className="grid gap-0.5">
              {trace.perIndex[k].map((h, i) => (
                <li key={h.blockId} className="flex min-w-0 items-baseline gap-2 text-xs">
                  <span className="text-muted-foreground w-4 shrink-0 tabular-nums">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{where(h)}</span>
                  <Score value={h.score} on={scores} />
                </li>
              ))}
            </ol>
          )}
        </section>
      ))}
    </div>
  );
}

function Ranked({
  trace,
  answer,
  scores,
}: {
  trace: AnswerTrace;
  answer: GroundedAnswer;
  scores: boolean;
}) {
  const list = reranked(trace);
  const cut = list.findIndex((r) => r.score < trace.threshold);
  return (
    <ol className="grid gap-1">
      {list.map((r, i) => {
        const n = answer.sources.find((s) => s.blockId === r.blockId)?.n;
        return (
          <li key={r.blockId} className="grid gap-1">
            {i === cut && (
              <p className="text-muted-foreground border-t border-dashed pt-1 text-xs">
                Not good enough to answer from{scores && ` (below ${score(trace.threshold)})`}
              </p>
            )}
            <div
              className={cn(
                "flex min-w-0 items-baseline gap-2 text-xs",
                i >= cut && cut >= 0 && "opacity-60",
              )}
            >
              <span className="text-muted-foreground w-4 shrink-0 tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{where(r)}</span>
                <span className="flex flex-wrap gap-1 pt-0.5">
                  {r.foundBy.map((f) => (
                    <IndexTag key={f.index} index={f.index} rank={scores ? f.rank : undefined} />
                  ))}
                </span>
              </span>
              {n !== undefined && <span className="shrink-0 text-xs font-medium">cited [{n}]</span>}
              <Score value={r.score} on={scores} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Used({ used, answer }: { used: UsedPassage[]; answer: GroundedAnswer }) {
  return (
    <ul aria-label="Passages used" className="grid gap-2">
      {used.map((u) => {
        const source = answer.sources.find((s) => s.n === u.n);
        return (
          <li key={u.n} className="flex min-w-0 gap-2 rounded-md border p-2 text-sm">
            {source && <Citation source={source} />}
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">{where(u.entry)}</p>
              <p className="text-muted-foreground text-xs italic">“{u.entry.citation?.snippet}”</p>
              {u.sentences.map((s) => (
                <p key={s} className="mt-1 text-xs">
                  → {s}
                </p>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Unused({
  unused,
  threshold,
  scores,
}: {
  unused: UnusedPassage[];
  threshold: number;
  scores: boolean;
}) {
  return (
    <ul className="grid gap-1">
      {unused.map((u) => (
        <li key={u.entry.blockId} className="flex min-w-0 items-baseline gap-2 text-xs">
          <span className="min-w-0 flex-1">
            <span className="block truncate">{where(u.entry)}</span>
            <span className="text-muted-foreground">
              {u.reason === "not-needed"
                ? "Good enough, but the answer didn't need it."
                : `Doesn't answer the question well enough${scores ? ` (below ${score(threshold)})` : ""}.`}
            </span>
          </span>
          <Score value={u.entry.score} on={scores} />
        </li>
      ))}
    </ul>
  );
}

function NothingQualified({ trace, scores }: { trace: AnswerTrace; scores: boolean }) {
  const reason = notFoundReason(trace);
  if (!reason) return null;
  const closest: MergedResult | undefined = reason.closest;
  return (
    <div className="grid gap-1 text-sm">
      <p>
        {reason.found === 0
          ? "No index found anything."
          : `The indexes found ${reason.found} passages, but none of them answers the question well enough to answer from.`}
      </p>
      {closest && (
        <p className="text-muted-foreground text-xs">
          The closest was {where(closest)}: “{closest.citation?.snippet}”
          {scores && ` — ${score(closest.score)}, the bar is ${score(reason.threshold)}`}.
        </p>
      )}
      <p className="text-muted-foreground text-xs">
        Searched {reason.indexes.map((k) => indexWords[k].label).join(", ")} for{" "}
        {reason.searched.map((q) => `“${q}”`).join(", ")}.
      </p>
    </div>
  );
}

// --- The two layouts --------------------------------------------------------------

interface Stage {
  id: string;
  title: string;
  summary?: string;
  detail?: ReactNode;
  open?: boolean;
  count?: number;
}

function stagesOf(trace: AnswerTrace, answer: GroundedAnswer, scores: boolean): Stage[] {
  const counts = funnel(trace, answer);
  const { used, unused } = passages(trace, answer);
  const per = indexKinds.map((k) => `${indexWords[k].label} ${trace.perIndex[k].length}`);
  const stages: Stage[] = [
    {
      id: "expand",
      title: `Rephrased into ${counts.queries} searches`,
      summary: trace.expanded.map((q) => `“${q.query}”`).join(", "),
      detail: <Rephrasings trace={trace} scores={scores} />,
      count: counts.queries,
    },
    {
      id: "search",
      title: `Searched ${indexKinds.length} indexes on this computer`,
      summary: `${counts.hits} results · ${per.join(" · ")}`,
      detail: <PerIndex trace={trace} scores={scores} />,
      count: counts.hits,
    },
    {
      id: "rerank",
      title: `Ranked ${counts.passages} passages by how well they answer`,
      summary: `${counts.qualified} good enough to answer from`,
      detail: <Ranked trace={trace} answer={answer} scores={scores} />,
      count: counts.passages,
    },
  ];
  if (used.length === 0)
    return [
      ...stages,
      {
        id: "none",
        title: "Nothing good enough — no answer written",
        detail: <NothingQualified trace={trace} scores={scores} />,
        open: true,
        count: 0,
      },
    ];
  return [
    ...stages,
    {
      id: "used",
      title: `Used ${used.length} passage${used.length > 1 ? "s" : ""} in the answer`,
      detail: <Used used={used} answer={answer} />,
      open: true,
      count: counts.cited,
    },
    ...(unused.length
      ? [
          {
            id: "unused",
            title: `Found but not used: ${unused.length}`,
            detail: <Unused unused={unused} threshold={trace.threshold} scores={scores} />,
          },
        ]
      : []),
  ];
}

function StageToggle({
  stage,
  children,
}: {
  stage: Stage;
  children: (open: boolean) => ReactNode;
}) {
  const [open, setOpen] = useState(!!stage.open);
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="hover:bg-accent flex w-full min-w-0 items-start gap-2 rounded px-1 py-1 text-left"
      >
        {open ? (
          <ChevronDown className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        ) : (
          <ChevronRight className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        )}
        {children(open)}
      </button>
      {open && stage.detail && <div className="mt-1 mb-2 ml-7 min-w-0">{stage.detail}</div>}
    </>
  );
}

function Timeline({ question, stages }: { question: string; stages: Stage[] }) {
  return (
    <ol className="grid gap-1">
      <li className="flex min-w-0 gap-2 px-1 py-1">
        <Search className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        <span className="min-w-0">
          <span className="block text-sm font-medium">Your question</span>
          <span className="text-muted-foreground block text-xs">{question}</span>
        </span>
      </li>
      {stages.map((s) => (
        <li key={s.id} className="min-w-0">
          <StageToggle stage={s}>
            {() => (
              <span className="min-w-0">
                <span className="block text-sm font-medium">{s.title}</span>
                {s.summary && (
                  <span className="text-muted-foreground block text-xs break-words">
                    {s.summary}
                  </span>
                )}
              </span>
            )}
          </StageToggle>
        </li>
      ))}
    </ol>
  );
}

function Funnel({ stages }: { stages: Stage[] }) {
  const max = Math.max(1, ...stages.map((s) => s.count ?? 0));
  return (
    <ol className="grid gap-1">
      {stages.map((s) => (
        <li key={s.id} className="min-w-0">
          <StageToggle stage={s}>
            {() => (
              <span className="grid min-w-0 flex-1 gap-1">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="min-w-0 flex-1 text-sm">{s.title}</span>
                  {s.count !== undefined && (
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{s.count}</span>
                  )}
                </span>
                {s.count !== undefined && (
                  <span className="bg-muted block h-2 w-full overflow-hidden rounded-full">
                    <span
                      className="bg-primary block h-full rounded-full"
                      style={{ width: `${(100 * s.count) / max}%` }}
                    />
                  </span>
                )}
              </span>
            )}
          </StageToggle>
        </li>
      ))}
    </ol>
  );
}

export interface HowAnsweredProps {
  answer: GroundedAnswer;
  variant?: HowVariant;
  /** Show scores, thresholds and query types. Off by default. */
  scores?: boolean;
}

/** D4: what happened between the question and the answer. */
export function HowAnswered({
  answer,
  variant = "timeline",
  scores: initial = false,
}: HowAnsweredProps) {
  const [scores, setScores] = useState(initial);
  const trace = traceFor(answer);
  if (!trace)
    return <p className="text-muted-foreground text-sm">No record of how this was answered.</p>;
  const stages = stagesOf(trace, answer, scores);
  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex items-center justify-end">
        <Button
          size="sm"
          variant="outline"
          aria-pressed={scores}
          onClick={() => setScores(!scores)}
          className="h-7 text-xs"
        >
          {scores ? "Hide scores" : "Show scores"}
        </Button>
      </div>
      {variant === "timeline" ? (
        <Timeline question={trace.question} stages={stages} />
      ) : (
        <Funnel stages={stages} />
      )}
    </div>
  );
}

/** A D1 answer with the "How was this answered?" link that opens D4. */
export function AnswerWithHow({
  answer,
  variant = "timeline",
}: {
  answer: GroundedAnswer;
  variant?: HowVariant;
}) {
  return (
    <Card className="w-full max-w-3xl gap-4 p-4">
      <div className="flex min-w-0 items-start gap-2">
        <Search className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        <p className="min-w-0 font-medium">{answer.question}</p>
      </div>
      <GroundedAnswerView answer={answer} />
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="link" size="sm" className="h-auto self-start p-0">
            <Route /> How was this answered?
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90svh] grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
          <DialogHeader className="min-w-0">
            <DialogTitle>How this was answered</DialogTitle>
            <DialogDescription>
              Every step ran on this computer, over the indexes of your folder.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto">
            <HowAnswered answer={answer} variant={variant} />
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
