import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@statewalker/ui.view.shadcn";
import {
  ChevronDown,
  ChevronUp,
  CircleAlert,
  CircleCheck,
  CircleSlash,
  CircleX,
  FilePen,
  FilePlus,
  Loader2,
  MessageSquare,
  RotateCcw,
  Square,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { today } from "../mock.js";
import {
  type ApprovalAnswer,
  abortChat,
  answerApproval,
  type Chat,
  outputsOf,
  type ProducedFile,
  retryTask,
  scenarios,
  stripSummary,
  type TaskStatus,
  type TasksScenario,
  type TaskView,
  tasksFromConversation,
} from "./tasks.js";

// The workspace's bottom zone: one line while closed, the tasks and the files
// they produced when opened. Everything shown is derived from the chats' Flue
// conversations by `tasksFromConversation`; the strip keeps no task state.

export type TasksVariant = "list" | "timeline";

interface Actions {
  cancel(task: TaskView): void;
  retry(task: TaskView): void;
  answer(task: TaskView, answer: ApprovalAnswer): void;
  openChat(task: TaskView): void;
  openFile(file: ProducedFile): void;
  showInFolder(file: ProducedFile): void;
  undo(file: ProducedFile): void;
}

const status: Record<TaskStatus, { label: string; icon: ReactNode }> = {
  running: {
    label: "Running",
    icon: <Loader2 className="text-muted-foreground size-4 shrink-0 animate-spin" />,
  },
  waiting: {
    label: "Waiting for you",
    icon: <CircleAlert className="text-warning size-4 shrink-0" />,
  },
  done: { label: "Done", icon: <CircleCheck className="text-success size-4 shrink-0" /> },
  failed: { label: "Failed", icon: <CircleX className="text-destructive size-4 shrink-0" /> },
  stopped: {
    label: "Stopped",
    icon: <CircleSlash className="text-muted-foreground size-4 shrink-0" />,
  },
};

const isActive = (t: TaskView) => t.status === "running" || t.status === "waiting";
const hhmm = (d: Date) => d.toISOString().slice(11, 16);

function elapsed(task: TaskView) {
  const min = Math.round(((task.endedAt ?? today).getTime() - task.startedAt.getTime()) / 60000);
  if (min < 1) return "under a minute";
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}

function dayLabel(d: Date) {
  const days = Math.round(
    (Date.parse(today.toISOString().slice(0, 10)) - Date.parse(d.toISOString().slice(0, 10))) /
      864e5,
  );
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

function groupBy<T>(items: T[], key: (item: T) => string): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return [...groups];
}

function Confirm({
  trigger,
  title,
  children,
  action,
  keep,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  children: ReactNode;
  action: string;
  keep: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="grid gap-2">{children}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{keep}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{action}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function FileRow({
  file,
  actions,
  showTask,
}: {
  file: ProducedFile;
  actions: Actions;
  showTask?: boolean;
}) {
  return (
    <li aria-label={file.path} className="grid gap-1 rounded-md border px-2 py-1.5">
      <div className="flex min-w-0 items-center gap-1.5 text-xs">
        {file.change === "created" ? (
          <FilePlus className="size-3.5 shrink-0" />
        ) : (
          <FilePen className="size-3.5 shrink-0" />
        )}
        <span className="truncate font-medium">{file.path}</span>
        <span className="text-muted-foreground shrink-0">
          {file.change === "created" ? "new" : "changed"}
        </span>
      </div>
      {showTask && (
        <p className="text-muted-foreground text-xs">
          Made by “{file.taskTitle}” · {dayLabel(file.at)} {hhmm(file.at)}
        </p>
      )}
      <div className="flex flex-wrap gap-1">
        <Button
          size="xs"
          variant="outline"
          aria-label={`Open ${file.path}`}
          onClick={() => actions.openFile(file)}
        >
          Open
        </Button>
        <Button
          size="xs"
          variant="ghost"
          aria-label={`Show ${file.path} in folder`}
          onClick={() => actions.showInFolder(file)}
        >
          Show in folder
        </Button>
        {file.change === "created" && (
          <Confirm
            trigger={
              <Button size="xs" variant="ghost" aria-label={`Undo ${file.path}`}>
                <RotateCcw /> Undo
              </Button>
            }
            title={`Delete ${file.path}?`}
            action="Delete file"
            keep="Keep it"
            onConfirm={() => actions.undo(file)}
          >
            <p>
              “{file.taskTitle}” made this file, so undoing it deletes it from your folder, with
              anything you changed in it since.
            </p>
          </Confirm>
        )}
      </div>
    </li>
  );
}

function ApprovalCard({ task, actions }: { task: TaskView; actions: Actions }) {
  const approval = task.approval;
  if (!approval) return null;
  return (
    <div className="border-warning/60 grid gap-2 rounded-lg border p-2.5">
      <div className="flex items-center gap-2 text-sm font-medium">
        <FilePen className="text-warning size-4" /> Change {approval.file}?
      </div>
      <p className="text-muted-foreground text-xs">{approval.summary}</p>
      <ul className="bg-muted grid gap-0.5 rounded-md p-2 text-xs">
        {approval.preview.map((line) => {
          const text = line.slice(2);
          const checkbox = text.startsWith("- [ ] ");
          return (
            <li
              key={line}
              className={cn(
                "flex items-start gap-1.5 rounded px-1.5 py-0.5",
                line.startsWith("+") && "bg-success/15",
                line.startsWith("-") && "text-muted-foreground line-through",
              )}
            >
              {checkbox && <Square className="mt-px size-3.5 shrink-0" />}
              <span>{text.replace(/^- \[ \] /, "")}</span>
              {line.startsWith("+") && (
                <span className="text-success ml-auto shrink-0 font-medium">new</span>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => actions.answer(task, "once")}>
          Allow
        </Button>
        <Button size="sm" variant="outline" onClick={() => actions.answer(task, "task")}>
          Allow for this task
        </Button>
        <Button size="sm" variant="ghost" onClick={() => actions.answer(task, "deny")}>
          Don't change it
        </Button>
      </div>
    </div>
  );
}

function TaskDetails({ task, actions }: { task: TaskView; actions: Actions }) {
  const working = task.status === "running" && !task.steps.some((s) => s.state === "running");
  return (
    <div className="grid gap-2 pt-2">
      <p className="text-muted-foreground text-xs">You asked: “{task.request}”</p>
      {isActive(task) && (
        <p className="text-xs">
          Step {task.stepNumber} of {task.plan.length}: {task.plan[task.stepNumber - 1]}
        </p>
      )}
      <ul aria-label="Steps" className="grid gap-1">
        {task.steps.map((s) => (
          <li key={s.id} className="flex items-start gap-2 text-xs">
            {s.state === "running" ? (
              <Loader2 className="text-muted-foreground mt-px size-3.5 shrink-0 animate-spin" />
            ) : s.state === "failed" ? (
              <CircleX className="text-destructive mt-px size-3.5 shrink-0" />
            ) : (
              <CircleCheck className="text-muted-foreground mt-px size-3.5 shrink-0" />
            )}
            <span className="min-w-0">
              {s.label}
              {s.reason && <span className="text-destructive block">{s.reason}</span>}
            </span>
          </li>
        ))}
        {working && (
          <li className="text-muted-foreground flex items-center gap-2 text-xs">
            <Loader2 className="size-3.5 animate-spin" /> Working…
          </li>
        )}
      </ul>
      <ApprovalCard task={task} actions={actions} />
      {task.files.length > 0 && (
        <ul aria-label="Files" className="grid gap-1.5">
          {task.files.map((f) => (
            <FileRow key={f.path} file={f} actions={actions} />
          ))}
        </ul>
      )}
      {task.note && <p className="text-muted-foreground text-xs">{task.note}</p>}
      <div className="flex flex-wrap gap-1">
        {isActive(task) && (
          <Confirm
            trigger={
              <Button size="xs" variant="outline">
                <Square /> Cancel task
              </Button>
            }
            title={`Cancel “${task.title}”?`}
            action="Cancel task"
            keep="Keep going"
            onConfirm={() => actions.cancel(task)}
          >
            <p>It stops now. Files it already made stay in your folder.</p>
            {task.queued.length > 0 ? (
              <>
                <p>
                  This also cancels what you asked after it in “{task.chatTitle}”, which was waiting
                  for it to finish:
                </p>
                <ul className="list-disc pl-5">
                  {task.queued.map((q) => (
                    <li key={q}>“{q}”</li>
                  ))}
                </ul>
              </>
            ) : (
              <p>Nothing else is waiting in “{task.chatTitle}”.</p>
            )}
          </Confirm>
        )}
        {(task.status === "failed" || task.status === "stopped") && (
          <Button size="xs" variant="outline" onClick={() => actions.retry(task)}>
            <RotateCcw /> Retry
          </Button>
        )}
        <Button size="xs" variant="ghost" onClick={() => actions.openChat(task)}>
          <MessageSquare /> Open the conversation
        </Button>
      </div>
    </div>
  );
}

/** A — one row per task, expandable. */
function TaskList({ tasks, actions }: { tasks: TaskView[]; actions: Actions }) {
  const groups = groupBy(tasks, (t) => (dayLabel(t.startedAt) === "Today" ? "Today" : "Earlier"));
  return (
    <div className="grid gap-3">
      {groups.map(([label, items]) => (
        <section key={label} className="grid gap-1.5">
          <h3 className="text-muted-foreground text-xs font-medium">{label}</h3>
          <ul className="grid gap-1.5">
            {items.map((t) => (
              <li key={t.id} aria-label={t.title}>
                <Collapsible defaultOpen={isActive(t)} className="rounded-lg border px-3 py-2">
                  <CollapsibleTrigger className="group flex w-full items-start gap-2 text-left">
                    <span className="mt-0.5">{status[t.status].icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{t.title}</span>
                      <span className="text-muted-foreground block text-xs">
                        {status[t.status].label} · {elapsed(t)} · from “{t.chatTitle}”
                      </span>
                    </span>
                    <ChevronDown className="text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <TaskDetails task={t} actions={actions} />
                  </CollapsibleContent>
                </Collapsible>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** B — a timeline by day; each task one compact line, its steps as dots. */
function TaskTimeline({ tasks, actions }: { tasks: TaskView[]; actions: Actions }) {
  return (
    <div className="grid gap-3">
      {groupBy(tasks, (t) => dayLabel(t.startedAt)).map(([label, items]) => (
        <section key={label} className="grid gap-1">
          <h3 className="text-muted-foreground text-xs font-medium">{label}</h3>
          <ol className="border-border ml-1.5 grid gap-0.5 border-l">
            {items.map((t) => (
              <li key={t.id} aria-label={t.title} className="pl-3">
                <Collapsible defaultOpen={t.status === "waiting"}>
                  <CollapsibleTrigger className="hover:bg-accent flex w-full items-center gap-2 rounded px-1 py-1 text-left">
                    <time className="text-muted-foreground w-10 shrink-0 text-xs tabular-nums">
                      {hhmm(t.startedAt)}
                    </time>
                    {status[t.status].icon}
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    <span
                      className="flex shrink-0 items-center gap-1"
                      title={`${t.steps.length} steps · ${status[t.status].label}`}
                    >
                      {t.steps.map((s) => (
                        <span
                          key={s.id}
                          className={cn(
                            "size-2 rounded-full",
                            s.state === "done" && "bg-muted-foreground",
                            s.state === "running" && "border-muted-foreground animate-pulse border",
                            s.state === "failed" && "bg-destructive",
                          )}
                        />
                      ))}
                    </span>
                    {t.files.length > 0 && (
                      <span className="text-muted-foreground flex shrink-0 items-center text-xs">
                        <FilePlus className="size-3.5" />
                        {t.files.length}
                      </span>
                    )}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pb-2 pl-1">
                    <p className="text-muted-foreground pt-1 text-xs">
                      {status[t.status].label} · {elapsed(t)} · from “{t.chatTitle}”
                    </p>
                    <TaskDetails task={t} actions={actions} />
                  </CollapsibleContent>
                </Collapsible>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

export interface TasksStripProps {
  scenario: TasksScenario;
  variant?: TasksVariant;
  /** Start opened. */
  defaultOpen?: boolean;
  defaultTab?: "tasks" | "files";
}

export function TasksStrip({
  scenario,
  variant = "list",
  defaultOpen = false,
  defaultTab = "tasks",
}: TasksStripProps) {
  const [chats, setChats] = useState<Chat[]>(scenarios[scenario]);
  const [deleted, setDeleted] = useState<string[]>([]);
  const [open, setOpen] = useState(defaultOpen);
  const [notice, setNotice] = useState("");

  const tasks = useMemo(
    () =>
      chats
        .flatMap(tasksFromConversation)
        .map((t) => ({ ...t, files: t.files.filter((f) => !deleted.includes(f.path)) }))
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()),
    [chats, deleted],
  );
  const outputs = outputsOf(tasks);
  const summary = stripSummary(tasks);

  const update = (task: TaskView, change: (chat: Chat) => Chat) =>
    setChats((all) => all.map((c) => (c.id === task.chatId ? change(c) : c)));
  const actions: Actions = {
    cancel: (t) => update(t, abortChat),
    retry: (t) => update(t, (c) => retryTask(c, t.id)),
    answer: (t, answer) => update(t, (c) => answerApproval(c, t.id, answer)),
    openChat: (t) => setNotice(`Opening the conversation “${t.chatTitle}”`),
    openFile: (f) => setNotice(`Opened ${f.path} in the center`),
    showInFolder: (f) => setNotice(`Showing ${f.path} in the folder`),
    undo: (f) => {
      setDeleted((d) => [...d, f.path]);
      setNotice(`Deleted ${f.path}`);
    },
  };

  const summaryIcon = {
    none: null,
    running: status.running.icon,
    waiting: status.waiting.icon,
    done: status.done.icon,
    failed: status.failed.icon,
  }[summary.icon];

  return (
    <section
      aria-label="Tasks"
      className={cn(
        "bg-background flex w-full flex-col border-t text-sm",
        open && "h-[min(34rem,75svh)]",
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="hover:bg-accent/50 flex h-9 w-full shrink-0 items-center gap-2 px-3 text-left"
      >
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Tasks
        </span>
        {summaryIcon}
        <span className="min-w-0 flex-1 truncate">{summary.text}</span>
        {summary.waiting > 0 && (
          <span className="bg-warning/15 flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
            <CircleAlert className="text-warning size-3" /> {summary.waiting} waiting for you
          </span>
        )}
        {open ? (
          <ChevronDown className="text-muted-foreground size-4 shrink-0" />
        ) : (
          <ChevronUp className="text-muted-foreground size-4 shrink-0" />
        )}
      </button>
      {open && (
        <Tabs defaultValue={defaultTab} className="flex min-h-0 flex-1 flex-col gap-0">
          <TabsList className="mx-3 mb-2 w-fit">
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
            <TabsTrigger value="files">Files produced ({outputs.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="tasks" className="min-h-0 flex-1">
            <ScrollArea className="h-full">
              <div className="px-3 pb-3">
                {tasks.length === 0 ? (
                  <p className="text-muted-foreground py-6 text-center text-sm">
                    Nothing yet. When you ask the assistant to make or change files, the work shows
                    up here: its steps, and the files it made.
                  </p>
                ) : variant === "list" ? (
                  <TaskList tasks={tasks} actions={actions} />
                ) : (
                  <TaskTimeline tasks={tasks} actions={actions} />
                )}
              </div>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="files" className="min-h-0 flex-1">
            <ScrollArea className="h-full">
              <div className="grid gap-2 px-3 pb-3">
                <p className="text-muted-foreground text-xs">
                  Everything the assistant made in Outputs, newest first.
                </p>
                {outputs.length === 0 ? (
                  <p className="text-muted-foreground py-6 text-center text-sm">
                    Nothing in Outputs yet.
                  </p>
                ) : (
                  <ul aria-label="Files produced" className="grid gap-1.5">
                    {outputs.map((f) => (
                      <FileRow key={f.path} file={f} actions={actions} showTask />
                    ))}
                  </ul>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      )}
      {notice && (
        <p role="status" className="text-muted-foreground border-t px-3 py-1.5 text-xs">
          {notice} <span className="italic">(prototype)</span>
        </p>
      )}
    </section>
  );
}
