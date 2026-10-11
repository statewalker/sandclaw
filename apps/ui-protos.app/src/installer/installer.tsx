import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
  Input,
  Label,
} from "@statewalker/ui.view.shadcn";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Loader2,
  RefreshCw,
  RotateCcw,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { group } from "../mock.js";
import {
  type CheckStatus,
  catalogue,
  checksPass,
  DISK_ROOM_GB,
  defaultChoice,
  downloadPlan,
  downloadSeconds,
  evaluateChecks,
  firstInviteLink,
  formatDuration,
  formatGB,
  jobs,
  type MachineFacts,
  type ModelChoice,
  macMini,
  type Names,
  requiredDiskGB,
  resumeStep,
  SANDCLAW_IMAGES,
  type ServiceId,
  type StepId,
  services,
  stepIndex,
  steps,
  validateNames,
} from "./install-steps.js";

/** Where one service is in "start and test". */
export type TestState = "waiting" | "running" | "ok" | "failed";

export interface InstallerProps {
  /** A: a wizard with a step rail and Next/Back. B: one page whose sections open in turn. */
  variant?: "steps" | "single-page";
  /** The step to open at; by default the first step not in `done`. */
  step?: StepId;
  /** Steps already done; by default every step before `step`. */
  done?: StepId[];
  /** The wizard reopened after the Mac restarted. */
  resumed?: boolean;
  facts?: MachineFacts;
  /** What the machine reports on "Check again" (prototype only). */
  factsAfterCheck?: MachineFacts;
  choice?: ModelChoice;
  names?: Names;
  /** The connection's speed, in Mbit/s, as measured by the setup service. */
  connectionMbps?: number;
  /** How much was already downloaded (kept across a restart). */
  downloadedGB?: number;
  tests?: Partial<Record<ServiceId, TestState>>;
  /** The service whose test fails once; Retry passes (prototype only). */
  failingService?: ServiceId;
  /** One tick of the mock progress, in ms. */
  tickMs?: number;
}

const filledNames: Names = { group: group.name, admin: "Claire Morel" };

const statusIcon: Record<CheckStatus, ReactNode> = {
  pass: <CheckCircle2 aria-label="Fine" className="text-success mt-0.5 size-4 shrink-0" />,
  warn: <TriangleAlert aria-label="Warning" className="text-warning mt-0.5 size-4 shrink-0" />,
  fail: <XCircle aria-label="Problem" className="text-destructive mt-0.5 size-4 shrink-0" />,
};

/** Technical detail, for whoever helps, behind a disclosure. */
function Details({ label = "Show details", children }: { label?: string; children: ReactNode }) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="text-muted-foreground group flex items-center gap-1 text-xs">
        <ChevronDown className="size-3.5 transition-transform group-data-[state=closed]:-rotate-90" />
        {label}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="bg-muted mt-1 rounded-md p-2 font-mono text-xs break-all whitespace-pre-wrap">
          {children}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

function Bar({ fraction }: { fraction: number }) {
  return (
    <div aria-hidden className="bg-muted h-2 overflow-hidden rounded-full">
      <div className="bg-primary h-full" style={{ width: `${Math.round(100 * fraction)}%` }} />
    </div>
  );
}

/** A stand-in for the QR code: a fixed pattern, not a scannable code. */
function QrPlaceholder() {
  const cells = Array.from({ length: 21 * 21 }, (_, i) => (i * 7919) % 13 < 6);
  return (
    <svg viewBox="0 0 21 21" className="mx-auto size-36" role="img" aria-label="QR code">
      {cells.map((on, i) =>
        on ? <rect key={i} x={i % 21} y={Math.floor(i / 21)} width="1" height="1" /> : null,
      )}
      {[0, 14].flatMap((x) =>
        [0, 14].map((y) =>
          x === 14 && y === 14 ? null : (
            <rect
              key={`${x}-${y}`}
              x={x + 0.5}
              y={y + 0.5}
              width="6"
              height="6"
              fill="var(--background)"
              stroke="currentColor"
            />
          ),
        ),
      )}
    </svg>
  );
}

function Rail({ step, done }: { step: StepId; done: StepId[] }) {
  return (
    <ol aria-label="Setup steps" className="flex gap-1.5 sm:flex-col sm:gap-2.5">
      {steps.map((s, i) => {
        const isDone = done.includes(s.id);
        const current = s.id === step;
        return (
          <li
            key={s.id}
            aria-current={current ? "step" : undefined}
            className="flex items-center gap-2 text-sm"
          >
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full border text-xs",
                isDone && "border-success bg-success text-white",
                current && "border-primary bg-primary text-primary-foreground",
              )}
            >
              {isDone ? <Check aria-label="done" className="size-3.5" /> : i + 1}
            </span>
            <span className={cn("hidden sm:inline", !current && "text-muted-foreground")}>
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** The setup wizard on the group's machine, at http://localhost. Mock steps throughout. */
export function Installer({
  variant = "steps",
  step: openAt,
  done: initialDone,
  resumed = false,
  facts: initialFacts = macMini,
  factsAfterCheck,
  choice: initialChoice = defaultChoice,
  names: initialNames,
  connectionMbps = 50,
  downloadedGB = 0,
  tests: initialTests = {},
  failingService,
  tickMs = 500,
}: InstallerProps) {
  const firstStep = openAt ?? resumeStep(initialDone ?? []);
  const [step, setStep] = useState<StepId>(firstStep);
  const [done, setDone] = useState<StepId[]>(
    initialDone ?? steps.slice(0, stepIndex(firstStep)).map((s) => s.id),
  );
  const [facts, setFacts] = useState(initialFacts);
  const [checkedAgain, setCheckedAgain] = useState(false);
  const [choice, setChoice] = useState(initialChoice);
  // Names are blank until the names step; later steps show the mock group's.
  const [names, setNames] = useState<Names>(
    initialNames ??
      (stepIndex(firstStep) > stepIndex("names") ? filledNames : { group: "", admin: "" }),
  );
  const [triedNames, setTriedNames] = useState(false);
  const [downloaded, setDownloaded] = useState(downloadedGB);
  const [tests, setTests] = useState<Record<ServiceId, TestState>>(() => ({
    runtime: "waiting",
    "llm-api": "waiting",
    indexer: "waiting",
    hub: "waiting",
    ...initialTests,
  }));
  const [retried, setRetried] = useState(false);
  const [copied, setCopied] = useState(false);

  const plan = downloadPlan(choice);
  const needDisk = requiredDiskGB(downloadPlan(defaultChoice).totalGB);
  const checks = evaluateChecks(facts, needDisk);
  const fitsDisk = facts.freeDiskGB >= requiredDiskGB(plan.totalGB);
  const nameErrors = validateNames(names);
  const allPassed = services.every((s) => tests[s.id] === "ok");
  const link = firstInviteLink(names.group);

  const complete = (id: StepId) => {
    setDone((d) => (d.includes(id) ? d : [...d, id]));
    setStep(steps[stepIndex(id) + 1]?.id ?? id);
  };
  /** Back to an earlier question; what came after it is to be confirmed again. */
  const goBack = (id: StepId) => {
    setStep(id);
    setDone((d) => d.filter((x) => stepIndex(x) < stepIndex(id)));
  };

  // Mock download: one tick per twentieth; moves on to "start" by itself.
  useEffect(() => {
    if (step !== "download") return;
    const t = setTimeout(() => {
      if (downloaded >= plan.totalGB) complete("download");
      else setDownloaded((d) => Math.min(plan.totalGB, d + plan.totalGB / 20));
    }, tickMs);
    return () => clearTimeout(t);
  });

  // Mock start-and-test: one service at a time, in order; stops at a failure.
  useEffect(() => {
    if (step !== "start") return;
    const current = services.find((s) => tests[s.id] !== "ok");
    if (!current || tests[current.id] === "failed") return;
    const state = tests[current.id];
    const next: TestState =
      state === "waiting" ? "running" : failingService === current.id && !retried ? "failed" : "ok";
    const t = setTimeout(() => setTests((ts) => ({ ...ts, [current.id]: next })), tickMs);
    return () => clearTimeout(t);
  });

  const retry = (id: ServiceId) => {
    setRetried(true);
    setTests((ts) => ({ ...ts, [id]: "running" }));
  };

  const checkBody = (
    <div className="grid gap-3">
      <p className="text-muted-foreground text-sm">
        Sandclaw runs on this Mac for the whole group. First, a look at what it has.
      </p>
      <ul className="grid gap-3">
        {checks.map((c) => (
          <li key={c.id} className="flex gap-2.5 text-sm">
            {statusIcon[c.status]}
            <div className="grid min-w-0 flex-1 gap-1">
              <p>
                <span className="font-medium">{c.label}</span>: {c.says}
              </p>
              {c.fix && <p className="text-muted-foreground">{c.fix}</p>}
              <Details>{c.technical}</Details>
            </div>
          </li>
        ))}
      </ul>
      {!checksPass(checks) && (
        <p className="bg-muted rounded-md px-3 py-2 text-sm">
          Setup can&apos;t go on until the item marked in red is fixed.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setFacts(factsAfterCheck ?? facts);
            setCheckedAgain(true);
          }}
        >
          <RefreshCw /> Check again
        </Button>
        {checkedAgain && <span className="text-muted-foreground text-xs">Checked just now.</span>}
      </div>
    </div>
  );

  const modelsBody = (
    <div className="grid gap-4">
      <p className="text-muted-foreground text-sm">
        The models run here, on this Mac: nothing the group asks leaves it. Bigger models answer
        better, take longer to download and need more memory.
      </p>
      {jobs.map(({ job, label, what }) => (
        <fieldset key={job} className="grid gap-1.5">
          <legend className="text-sm font-semibold">
            {label} <span className="text-muted-foreground font-normal">· {what}</span>
          </legend>
          {catalogue
            .filter((m) => m.jobs.includes(job))
            .map((m) => {
              const tooBig = m.minMemoryGB > facts.memoryGB;
              const shared = job === "summary" && m.id === choice.chat;
              return (
                <label
                  key={m.id}
                  className={cn(
                    "has-checked:border-primary flex gap-2.5 rounded-md border p-2.5 text-sm",
                    tooBig && "opacity-60",
                  )}
                >
                  <input
                    type="radio"
                    name={`model-${job}`}
                    className="mt-1"
                    checked={choice[job] === m.id}
                    disabled={tooBig}
                    onChange={() => setChoice({ ...choice, [job]: m.id })}
                  />
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="flex flex-wrap justify-between gap-x-2">
                      <span className="font-medium">{m.name}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {formatGB(m.sizeGB)}
                      </span>
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {tooBig
                        ? `Needs ${m.minMemoryGB} GB of memory; this Mac has ${facts.memoryGB} GB.`
                        : shared
                          ? `${m.note} Same as chat: nothing more to download.`
                          : `${m.note} Download: ${formatDuration(downloadSeconds(m.sizeGB, connectionMbps))}.`}
                    </span>
                  </span>
                </label>
              );
            })}
        </fieldset>
      ))}
      <div className="bg-muted grid gap-1 rounded-md px-3 py-2 text-sm">
        <p>
          <span className="font-medium">To download: {formatGB(plan.totalGB)}</span>, Sandclaw
          itself included ({formatGB(SANDCLAW_IMAGES.sizeGB)}).
        </p>
        <p className="text-muted-foreground">
          {formatDuration(downloadSeconds(plan.totalGB, connectionMbps))} on this connection (
          {connectionMbps} Mbit/s).
        </p>
        {!fitsDisk && (
          <p className="text-destructive">
            Not enough space: this needs {requiredDiskGB(plan.totalGB)} GB with room for the
            group&apos;s data ({DISK_ROOM_GB} GB); {facts.freeDiskGB} GB are free. Pick smaller
            models.
          </p>
        )}
      </div>
    </div>
  );

  const namesBody = (
    <form
      id="installer-names"
      noValidate
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setTriedNames(true);
        if (Object.keys(nameErrors).length === 0) complete("names");
      }}
    >
      {(
        [
          ["group", "The group's name", group.name, "Everyone invited sees it."],
          [
            "admin",
            "Your name",
            "Claire Morel",
            "You'll be the group's first admin: you invite the others.",
          ],
        ] as const
      ).map(([field, label, example, hint]) => (
        <div key={field} className="grid gap-1.5">
          <Label htmlFor={`installer-${field}`}>{label}</Label>
          <Input
            id={`installer-${field}`}
            value={names[field]}
            placeholder={`e.g. ${example}`}
            aria-invalid={triedNames && !!nameErrors[field]}
            onChange={(e) => setNames({ ...names, [field]: e.target.value })}
          />
          <p
            className={cn(
              "text-xs",
              triedNames && nameErrors[field] ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {(triedNames && nameErrors[field]) || hint}
          </p>
        </div>
      ))}
      <p className="text-muted-foreground text-sm">
        That&apos;s all the questions. The rest takes a while and needs nobody: you can leave this
        page open and come back.
      </p>
    </form>
  );

  let reached = 0;
  const downloadBody = (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
          <span className="font-medium tabular-nums">
            {formatGB(downloaded)} of {formatGB(plan.totalGB)}
          </span>
          <span className="text-muted-foreground text-xs">
            {formatDuration(downloadSeconds(plan.totalGB - downloaded, connectionMbps))} left
          </span>
        </div>
        <Bar fraction={plan.totalGB ? downloaded / plan.totalGB : 1} />
      </div>
      <ul className="grid gap-1.5 text-sm">
        {plan.items.map((item) => {
          const start = reached;
          reached += item.sizeGB;
          const state =
            downloaded >= reached ? "done" : downloaded > start ? "downloading" : "waiting";
          return (
            <li key={item.id} className="flex items-center gap-2">
              {state === "done" ? (
                <Check aria-label="done" className="text-success size-4 shrink-0" />
              ) : state === "downloading" ? (
                <Loader2 aria-label="downloading" className="size-4 shrink-0 animate-spin" />
              ) : (
                <span className="size-4 shrink-0" />
              )}
              <span
                className={cn("min-w-0 flex-1", state === "waiting" && "text-muted-foreground")}
              >
                {item.label}
              </span>
              <span className="text-muted-foreground tabular-nums">{formatGB(item.sizeGB)}</span>
            </li>
          );
        })}
      </ul>
      <p className="text-muted-foreground text-sm">
        You can leave this running. If the Mac restarts, setup picks up where it stopped and keeps
        what is already downloaded.
      </p>
      <Details>{SANDCLAW_IMAGES.technical}</Details>
    </div>
  );

  const startBody = (
    <div className="grid gap-3">
      <p className="text-muted-foreground text-sm">
        Each part of Sandclaw starts, then gets a small test.
      </p>
      <ul className="grid gap-3">
        {services.map((s) => {
          const state = tests[s.id];
          return (
            <li key={s.id} className="flex gap-2.5 text-sm">
              {state === "ok" ? (
                <CheckCircle2 aria-label="passed" className="text-success mt-0.5 size-4 shrink-0" />
              ) : state === "running" ? (
                <Loader2 aria-label="testing" className="mt-0.5 size-4 shrink-0 animate-spin" />
              ) : state === "failed" ? (
                <XCircle aria-label="failed" className="text-destructive mt-0.5 size-4 shrink-0" />
              ) : (
                <span className="size-4 shrink-0" />
              )}
              <div className="grid min-w-0 flex-1 gap-1">
                <p className={cn(state === "waiting" && "text-muted-foreground")}>
                  <span className="font-medium">{s.name}</span>: {s.does}
                </p>
                {state === "running" && <p className="text-muted-foreground">{s.test}</p>}
                {state === "failed" && (
                  <div className="border-destructive/40 grid gap-2 rounded-md border p-3">
                    <p className="font-medium">{s.name} didn&apos;t pass its test.</p>
                    <p>{s.failure.says}</p>
                    <p className="text-muted-foreground">
                      Nothing is lost: the downloads are kept.
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button size="sm" onClick={() => retry(s.id)}>
                        <RotateCcw /> Retry
                      </Button>
                    </div>
                    <Details>{`${s.technical}\n${s.failure.log}`}</Details>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {allPassed && (
        <p className="text-sm font-medium">All four parts are running and passed their test.</p>
      )}
    </div>
  );

  const inviteBody = (
    <div className="grid gap-4">
      <p className="text-sm">
        Sandclaw is running for <span className="font-medium">{names.group}</span>. Open this link
        on the computer or phone you&apos;ll use Sandclaw on: it makes{" "}
        <span className="font-medium">{names.admin}</span> the group&apos;s admin.
      </p>
      <QrPlaceholder />
      <div className="flex gap-2">
        <Input readOnly value={link} aria-label="Your invite link" className="min-w-0 font-mono" />
        <Button variant="outline" onClick={() => setCopied(true)}>
          {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">
        The link works once, for 24 hours. From your device, you then invite the others.
      </p>
      <Details label="Where Sandclaw runs">
        {services.map((s) => `${s.name}: ${s.technical}`).join("\n")}
      </Details>
    </div>
  );

  const bodies: Record<StepId, ReactNode> = {
    check: checkBody,
    models: modelsBody,
    names: namesBody,
    download: downloadBody,
    start: startBody,
    invite: inviteBody,
  };

  /** The button that finishes a step, if the step has one. */
  const primary = (id: StepId): ReactNode => {
    switch (id) {
      case "check":
        return (
          <Button disabled={!checksPass(checks)} onClick={() => complete("check")}>
            Next
          </Button>
        );
      case "models":
        return (
          <Button disabled={!fitsDisk} onClick={() => complete("models")}>
            Next
          </Button>
        );
      case "names":
        return (
          <Button type="submit" form="installer-names">
            Download and set up
          </Button>
        );
      case "start":
        return (
          <Button disabled={!allPassed} onClick={() => complete("start")}>
            Make my invite
          </Button>
        );
      default:
        return null;
    }
  };

  const summaries: Record<StepId, string> = {
    check: checks.some((c) => c.status === "warn")
      ? "Ready, with a warning."
      : "Docker, disk, memory and graphics are fine.",
    models: `${[...new Set(Object.values(choice))]
      .map((id) => catalogue.find((m) => m.id === id)?.name)
      .join(", ")} · ${formatGB(plan.totalGB)}`,
    names: `${names.group} · ${names.admin} (admin)`,
    download: `${formatGB(plan.totalGB)} downloaded.`,
    start: "All four parts passed their test.",
    invite: "",
  };

  const header = (
    <CardHeader>
      <CardTitle>Set up Sandclaw on this Mac</CardTitle>
      <CardDescription>
        This page only opens on this Mac. It ends with your own invite into the group.
      </CardDescription>
      {resumed && (
        <p className="bg-muted mt-2 flex gap-2 rounded-md px-3 py-2 text-sm">
          <RotateCcw className="mt-0.5 size-4 shrink-0" />
          <span>
            Welcome back. The Mac restarted during setup; it carries on where it stopped
            {downloaded > 0 && `, with ${formatGB(downloaded)} already downloaded`}.
          </span>
        </p>
      )}
    </CardHeader>
  );

  if (variant === "single-page")
    return (
      <SinglePage
        header={header}
        step={step}
        done={done}
        bodies={bodies}
        primary={primary}
        summaries={summaries}
        onChange={goBack}
      />
    );

  const index = stepIndex(step);
  const canGoBack = index > 0 && index <= stepIndex("names");
  const action = primary(step);
  return (
    <Card className="w-full max-w-3xl gap-4">
      {header}
      <CardContent className="grid gap-6 sm:grid-cols-[9rem_minmax(0,1fr)]">
        <Rail step={step} done={done} />
        <section aria-labelledby="installer-step" className="grid content-start gap-4">
          <div>
            <p className="text-muted-foreground text-xs">
              Step {index + 1} of {steps.length}
            </p>
            <h2 id="installer-step" className="text-lg font-semibold">
              {steps[index]?.title}
            </h2>
          </div>
          {bodies[step]}
          {(canGoBack || action) && (
            <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
              {canGoBack ? (
                <Button variant="ghost" onClick={() => goBack(steps[index - 1]?.id ?? step)}>
                  Back
                </Button>
              ) : (
                <span />
              )}
              {action}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

/** B: every step on one page; done ones fold to a line, later ones wait their turn. */
function SinglePage({
  header,
  step,
  done,
  bodies,
  primary,
  summaries,
  onChange,
}: {
  header: ReactNode;
  step: StepId;
  done: StepId[];
  bodies: Record<StepId, ReactNode>;
  primary: (id: StepId) => ReactNode;
  summaries: Record<StepId, string>;
  onChange: (id: StepId) => void;
}) {
  const current = useRef<HTMLElement>(null);
  const opened = useRef(step);
  // Follow the open section down the page, but not on first render.
  useEffect(() => {
    if (opened.current === step) return;
    opened.current = step;
    current.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [step]);

  const asking = stepIndex(step) <= stepIndex("names");
  return (
    <Card className="w-full max-w-2xl gap-4">
      {header}
      <CardContent className="grid gap-3">
        {steps.map((s, i) => {
          const isCurrent = s.id === step;
          const isDone = done.includes(s.id) && !isCurrent;
          const locked = !isCurrent && !isDone;
          return (
            <section
              key={s.id}
              ref={isCurrent ? current : undefined}
              aria-labelledby={`installer-${s.id}-title`}
              className={cn(
                "grid scroll-mt-4 gap-4 rounded-lg border p-4",
                isCurrent && "border-primary",
                locked && "opacity-60",
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full border text-xs",
                    isDone && "border-success bg-success text-white",
                    isCurrent && "border-primary bg-primary text-primary-foreground",
                  )}
                >
                  {isDone ? <Check aria-label="done" className="size-3.5" /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id={`installer-${s.id}-title`} className="font-semibold">
                    {s.title}
                  </h2>
                  {isDone && (
                    <p className="text-muted-foreground text-sm break-words">{summaries[s.id]}</p>
                  )}
                  {locked && (
                    <p className="text-muted-foreground text-xs">
                      Opens after “{steps[i - 1]?.label}”.
                    </p>
                  )}
                </div>
                {isDone && asking && i < stepIndex("download") && (
                  <Button size="sm" variant="ghost" onClick={() => onChange(s.id)}>
                    Change
                  </Button>
                )}
              </div>
              {isCurrent && (
                <>
                  {bodies[s.id]}
                  {primary(s.id) && <div className="flex justify-end">{primary(s.id)}</div>}
                </>
              )}
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}
