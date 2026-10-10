import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Card,
  cn,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@statewalker/ui.view.shadcn";
import { ChevronDown, ChevronRight, ExternalLink, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { group, people, today } from "../mock.js";
import {
  type Assignment,
  consequences,
  assignment as defaultAssignment,
  models as defaultModels,
  usage as defaultUsage,
  inPeriod,
  type Job,
  jobs,
  type Model,
  type Period,
  perDay,
  type Totals,
  tokens,
  total,
  totalsBy,
  type UsageRecord,
} from "./usage.js";

/**
 * How the admin reads the AI models screen:
 * - `one-page`: models, jobs and usage on one scroll; LiteLLM opens in its own browser tab;
 * - `tabs`: Models | Usage | LiteLLM admin, the LiteLLM UI framed inside the third tab.
 */
export type Layout = "one-page" | "tabs";

export type GroupBy = "person" | "model";

export interface AiModelsProps {
  variant?: Layout;
  period?: Period;
  groupBy?: GroupBy;
  /** A person whose devices are unfolded. */
  open?: string;
  /** The tab shown first in the `tabs` layout. */
  tab?: "models" | "usage" | "litellm";
  /** The admin just picked `modelId` for `job`: the confirmation is open. */
  pick?: { job: Job; modelId: string };
  models?: Model[];
  usage?: UsageRecord[];
  /** "Now"; `today` from the mock by default. */
  now?: Date;
}

const periods: [Period, string][] = [
  [7, "Last 7 days"],
  [30, "Last 30 days"],
  [90, "Last 90 days"],
];

const jobWords: Record<Job, { name: string; hint: string }> = {
  chat: { name: "Chat", hint: "Answers in conversations" },
  summaries: { name: "Summaries", hint: "Of files and long conversations" },
  embeddings: { name: "Search index", hint: "Lets the assistant find things in your files" },
};

const devices = people.flatMap((p) => (p.devices ?? []).map((d) => ({ ...d, personId: p.id })));

/** "1.2 M", "34 k", "800". */
function count(n: number) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} k`;
  return String(n);
}

/** "$4.20", "under 1 cent", "free". */
function money(t: Totals) {
  if (t.cost === 0) return "free";
  if (t.cost < 0.01) return "under 1 cent";
  return `$${t.cost.toFixed(2)}`;
}

function WhereTag({ model }: { model: Model }) {
  return (
    <span className="bg-secondary inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs">
      <span
        className={cn("size-2 rounded-full", model.where === "hub" ? "bg-success" : "bg-warning")}
      />
      {model.where === "hub" ? "Stays in the office" : `Sent to ${model.provider}`}
    </span>
  );
}

function price(model: Model) {
  const { input, output } = model.pricePerMillion;
  if (input === 0 && output === 0) return "Free: runs on the hub";
  return output
    ? `$${input} in · $${output} out per million tokens`
    : `$${input} per million tokens`;
}

function ModelList({ models, assignment }: { models: Model[]; assignment: Assignment }) {
  return (
    <ul className="divide-y rounded-md border">
      {models.map((m) => {
        const doing = jobs.filter((j) => assignment[j] === m.id);
        return (
          <li key={m.id} className="grid gap-1 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-auto min-w-0 truncate text-sm font-medium">{m.name}</span>
              {!m.reachable && (
                <span className="text-destructive inline-flex items-center gap-1 text-xs">
                  <TriangleAlert className="size-3.5" /> Not answering
                </span>
              )}
              <WhereTag model={m} />
            </div>
            <p className="text-muted-foreground text-xs">
              {price(m)}
              {doing.length > 0 && ` · does ${doing.map((j) => jobWords[j].name).join(", ")}`}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function JobList({
  models,
  assignment,
  onPick,
}: {
  models: Model[];
  assignment: Assignment;
  onPick: (job: Job, modelId: string) => void;
}) {
  return (
    <ul className="grid gap-3">
      {jobs.map((job) => {
        const current = models.find((m) => m.id === assignment[job]);
        const id = `job-${job}`;
        return (
          <li key={job} className="grid gap-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor={id} className="min-w-0">
                <span className="block text-sm font-medium">{jobWords[job].name}</span>
                <span className="text-muted-foreground block text-xs">{jobWords[job].hint}</span>
              </label>
              <select
                id={id}
                value={assignment[job]}
                onChange={(e) => onPick(job, e.target.value)}
                className="border-input bg-background h-9 max-w-full min-w-0 rounded-md border px-2 text-sm"
              >
                {models
                  .filter((m) => m.canDo.includes(job))
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {m.where === "hub" ? " (in the office)" : ""}
                      {m.reachable ? "" : " (not answering)"}
                    </option>
                  ))}
              </select>
            </div>
            {current && !current.reachable && (
              <p className="text-destructive bg-destructive/10 rounded-md p-2 text-xs">
                {jobWords[job].name} is down: {current.name} does not answer. Pick another model, or
                check the hub's connection to {current.provider}.
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ConfirmSwitch({
  pick,
  models,
  assignment,
  onCancel,
  onConfirm,
}: {
  pick?: { job: Job; modelId: string };
  models: Model[];
  assignment: Assignment;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const to = models.find((m) => m.id === pick?.modelId);
  const from = models.find((m) => pick && m.id === assignment[pick.job]);
  return (
    <AlertDialog open={!!(pick && to && from)} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        {pick && to && from && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Use {to.name} for {jobWords[pick.job].name.toLowerCase()}?
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="grid gap-2">
                  {consequences(pick.job, from, to).map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep {from.name}</AlertDialogCancel>
              <AlertDialogAction onClick={onConfirm}>
                {pick.job === "embeddings" ? "Switch and re-index" : "Switch"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Toggle<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: [T, string][];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="bg-secondary flex flex-wrap rounded-md p-0.5">
      {options.map(([v, label]) => (
        <Button
          key={v}
          size="sm"
          variant={value === v ? "outline" : "ghost"}
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className="h-7"
        >
          {label}
        </Button>
      ))}
    </div>
  );
}

function DayBars({ days }: { days: ReturnType<typeof perDay> }) {
  const max = Math.max(1, ...days.map((d) => d.hub + d.cloud));
  return (
    <figure className="grid gap-1">
      <div className="flex h-24 items-end gap-px" role="img" aria-label="Tokens per day">
        {days.map((d) => (
          <div
            key={d.day}
            title={`${d.day}: ${count(d.cloud)} sent out, ${count(d.hub)} in the office`}
            className="flex min-w-0 flex-1 flex-col justify-end"
          >
            <div className="bg-warning" style={{ height: `${(d.cloud / max) * 96}px` }} />
            <div className="bg-success" style={{ height: `${(d.hub / max) * 96}px` }} />
          </div>
        ))}
      </div>
      <figcaption className="text-muted-foreground flex flex-wrap gap-x-4 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span className="bg-warning size-2 rounded-full" /> Sent to cloud models
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="bg-success size-2 rounded-full" /> Stayed in the office
        </span>
      </figcaption>
    </figure>
  );
}

/** One line of a breakdown: a name, its share of the period's tokens, tokens and cost. */
function ShareLine({
  name,
  detail,
  totals,
  of,
}: {
  name: string;
  detail?: string;
  totals: Totals;
  of: number;
}) {
  return (
    <span className="grid min-w-0 flex-1 gap-1">
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span className="mr-auto min-w-0 truncate text-sm font-medium">{name}</span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {count(tokens(totals))} tokens · {money(totals)}
        </span>
      </span>
      <span className="bg-secondary block h-1.5 overflow-hidden rounded-full">
        <span
          className="bg-primary block h-full"
          style={{ width: `${(tokens(totals) / Math.max(1, of)) * 100}%` }}
        />
      </span>
      {detail && <span className="text-muted-foreground block text-xs">{detail}</span>}
    </span>
  );
}

function PersonRow({
  personId,
  totals,
  records,
  of,
  models,
  initiallyOpen,
}: {
  personId: string;
  totals: Totals;
  records: UsageRecord[];
  of: number;
  models: Model[];
  initiallyOpen: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const person = people.find((p) => p.id === personId);
  const own = records.filter((r) => r.personId === personId);
  return (
    <li className="border-b last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="hover:bg-accent flex w-full items-start gap-2 px-3 py-2 text-left"
      >
        {open ? (
          <ChevronDown className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        ) : (
          <ChevronRight className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        )}
        <ShareLine name={person?.name ?? personId} totals={totals} of={of} />
      </button>
      {open && (
        <ul aria-label={`${person?.name ?? personId}'s devices`} className="grid gap-2 pb-3 pl-9">
          {totalsBy(own, "peerId", models).map((d) => {
            const used = totalsBy(
              own.filter((r) => r.peerId === d.id),
              "modelId",
              models,
            ).map((m) => models.find((x) => x.id === m.id)?.name ?? m.id);
            return (
              <li key={d.id} className="flex pr-3">
                <ShareLine
                  name={devices.find((x) => x.peerId === d.id)?.label ?? d.id}
                  detail={used.join(", ")}
                  totals={d.totals}
                  of={tokens(totals)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

function UsageSection({
  usage,
  models,
  now,
  initial,
}: {
  usage: UsageRecord[];
  models: Model[];
  now: Date;
  initial: Pick<AiModelsProps, "period" | "groupBy" | "open">;
}) {
  const [period, setPeriod] = useState<Period>(initial.period ?? 30);
  const [groupBy, setGroupBy] = useState<GroupBy>(initial.groupBy ?? "person");
  const records = inPeriod(usage, period, now);
  const sum = total(records, models);
  const span = periods.find(([p]) => p === period)?.[1].toLowerCase();

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Toggle options={periods} value={period} onChange={setPeriod} />
        <Toggle
          options={[
            ["person", "By person"],
            ["model", "By model"],
          ]}
          value={groupBy}
          onChange={setGroupBy}
        />
      </div>
      {records.length === 0 ? (
        <p className="text-muted-foreground p-8 text-center text-sm">
          Nobody used the AI models in the {span}.
        </p>
      ) : (
        <>
          <section aria-label="Totals" className="grid grid-cols-3 gap-2 text-center">
            {[
              [count(sum.requests), "requests"],
              [count(tokens(sum)), "tokens"],
              [money(sum), "estimated cost"],
            ].map(([value, label]) => (
              <div key={label} className="bg-secondary min-w-0 rounded-md p-2">
                <div className="truncate font-semibold tabular-nums">{value}</div>
                <div className="text-muted-foreground text-xs">{label}</div>
              </div>
            ))}
          </section>
          <p className="text-muted-foreground text-xs">
            A token is a piece of a word: a page of text is about 500 tokens. Costs are estimated
            from each provider's price list; the bill comes from the provider.
          </p>
          <DayBars days={perDay(records, period, now, models)} />
          {groupBy === "person" ? (
            <ul className="rounded-md border">
              {totalsBy(records, "personId", models).map((p) => (
                <PersonRow
                  key={p.id}
                  personId={p.id}
                  totals={p.totals}
                  records={records}
                  of={tokens(sum)}
                  models={models}
                  initiallyOpen={initial.open === p.id}
                />
              ))}
            </ul>
          ) : (
            <ul className="divide-y rounded-md border">
              {totalsBy(records, "modelId", models).map((m) => {
                const model = models.find((x) => x.id === m.id);
                return (
                  <li key={m.id} className="grid gap-1 p-3">
                    <ShareLine name={model?.name ?? m.id} totals={m.totals} of={tokens(sum)} />
                    {model && (
                      <span>
                        <WhereTag model={model} />
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** Where the LiteLLM UI shows: a placeholder for the iframe the hub proxies. */
function LiteLlmFrame() {
  return (
    <div className="grid gap-3">
      <p className="text-muted-foreground text-sm">
        The full LiteLLM admin: providers, prices, limits, logs. Members never hold a key, the hub
        calls the models for them; create keys here only for programs outside the group.
      </p>
      <div
        role="img"
        aria-label="LiteLLM admin (iframe)"
        className="text-muted-foreground grid h-80 place-items-center rounded-md border border-dashed p-4 text-center text-sm"
      >
        LiteLLM UI, proxied by the hub, shows here
      </div>
    </div>
  );
}

/** What "Open LiteLLM admin" opens: a browser tab of its own, the hub's page around the iframe. */
export function LiteLlmAdminPage() {
  return (
    <Card className="w-full max-w-3xl gap-0 py-0">
      <div className="bg-secondary flex min-w-0 items-center gap-2 rounded-t-xl border-b px-4 py-2 text-xs">
        <span className="bg-background min-w-0 truncate rounded px-2 py-1">
          LiteLLM admin · {group.name}
        </span>
      </div>
      <div className="grid gap-3 p-4">
        <h2 className="font-semibold">LiteLLM admin</h2>
        <LiteLlmFrame />
      </div>
    </Card>
  );
}

function useAssignment(models: Model[], pick?: AiModelsProps["pick"]) {
  const [current, setCurrent] = useState<Assignment>(defaultAssignment);
  const [pending, setPending] = useState(pick);
  const dialog = (
    <ConfirmSwitch
      pick={pending}
      models={models}
      assignment={current}
      onCancel={() => setPending(undefined)}
      onConfirm={() => {
        if (pending) setCurrent({ ...current, [pending.job]: pending.modelId });
        setPending(undefined);
      }}
    />
  );
  const onPick = (job: Job, modelId: string) => setPending({ job, modelId });
  return { current, onPick, dialog };
}

const openLiteLlm = (
  <Button variant="outline" size="sm">
    <ExternalLink /> Open LiteLLM admin
  </Button>
);

export function AiModels({
  variant = "one-page",
  tab = "models",
  pick,
  models = defaultModels,
  usage = defaultUsage,
  now = today,
  ...initial
}: AiModelsProps) {
  const { current, onPick, dialog } = useAssignment(models, pick);
  const modelsPart = (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <h3 className="text-sm font-semibold">Which model does what</h3>
        <JobList models={models} assignment={current} onPick={onPick} />
      </section>
      <section className="grid gap-3">
        <h3 className="text-sm font-semibold">Models LiteLLM serves</h3>
        <ModelList models={models} assignment={current} />
      </section>
    </div>
  );
  const usagePart = <UsageSection usage={usage} models={models} now={now} initial={initial} />;

  return (
    <Card className="w-full max-w-2xl gap-0 py-0">
      <div className="flex flex-wrap items-center gap-2 border-b p-4">
        <h2 className="mr-auto font-semibold">AI models</h2>
        {variant === "one-page" && openLiteLlm}
      </div>
      {variant === "one-page" ? (
        <div className="grid gap-8 p-4">
          {modelsPart}
          <section className="grid gap-3">
            <h3 className="text-sm font-semibold">Usage</h3>
            {usagePart}
          </section>
        </div>
      ) : (
        <Tabs defaultValue={tab} className="p-4">
          <TabsList className="max-w-full">
            <TabsTrigger value="models">Models</TabsTrigger>
            <TabsTrigger value="usage">Usage</TabsTrigger>
            <TabsTrigger value="litellm">LiteLLM admin</TabsTrigger>
          </TabsList>
          <TabsContent value="models" className="pt-2">
            {modelsPart}
          </TabsContent>
          <TabsContent value="usage" className="pt-2">
            {usagePart}
          </TabsContent>
          <TabsContent value="litellm" className="pt-2">
            <LiteLlmFrame />
          </TabsContent>
        </Tabs>
      )}
      {dialog}
    </Card>
  );
}
