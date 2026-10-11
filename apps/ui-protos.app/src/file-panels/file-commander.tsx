import {
  Button,
  cn,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@statewalker/ui.view.shadcn";
import type { FilesApi } from "@statewalker/webrun-files";
import {
  basename,
  dirname,
  extname,
  joinPath,
  normalizePath,
  readFile,
  readText,
} from "@statewalker/webrun-files";
import { CompositeFilesApi } from "@statewalker/webrun-files-composite";
import { Plus, X } from "lucide-react";
import { Fragment, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { formatBytes } from "../browser-data/storage.js";
import { newDemoStorages } from "./demo-storages.js";
import { readDropped } from "./dropped-files.js";
import { DeleteDialog, NewFolderDialog, RenameDialog } from "./file-dialogs.js";
import { FilePanel, type PanelCommand, type PanelHandle } from "./file-panel.js";
import { ProgressStrip } from "./progress-strip.js";
import { TransferDialog, type TransferTarget } from "./transfer-dialog.js";
import { planTransfer, type TransferOp, type TransferRequest } from "./transfer-plan.js";
import {
  problemOf,
  runTransfer,
  type TransferProgress,
  type TransferResult,
} from "./transfer-run.js";

type Storages = ReturnType<typeof newDemoStorages>;

export interface FileCommanderProps {
  storages?: Storages;
  /** The folders of the panels, left to right. */
  panels?: string[];
  /** Opens with these items selected in the first panel, and this dialog shown. */
  initial?: { dialog?: "copy" | "move" | "delete" | "rename" | "mkdir"; selected?: string[] };
  /** One panel at a time; also when the screen is narrower than 640 px. */
  phone?: boolean;
}

interface PanelState {
  id: number;
  path: string;
  selected: string[];
}

type Dialog =
  | {
      kind: "transfer";
      op: TransferOp;
      sources: string[];
      targets: TransferTarget[];
      /** Desktop drop: the workspace plus the dropped files at `/.drop`. */
      external?: FilesApi;
    }
  | { kind: "mkdir"; dir: string }
  | { kind: "rename"; path: string }
  | { kind: "delete"; paths: string[] };

interface Job {
  op: TransferOp;
  abort: AbortController;
  progress?: TransferProgress;
  result?: TransferResult;
}

interface Viewer {
  path: string;
  size: number;
  text?: string;
}

const TEXT_TYPES = [".md", ".txt", ".json", ".csv"];
const NARROW = "(max-width: 639px)";

function useNarrow(): boolean {
  const supported = typeof matchMedia === "function";
  const [narrow, setNarrow] = useState(() => supported && matchMedia(NARROW).matches);
  useEffect(() => {
    if (!supported) return;
    const query = matchMedia(NARROW);
    const update = () => setNarrow(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [supported]);
  return narrow;
}

/** The dialog a panel command opens; the copy/move targets are the other panels, most recent first. */
function dialogFor(
  command: PanelCommand,
  handle: PanelHandle,
  others: PanelState[],
  title: (path: string) => string,
): Dialog | undefined {
  const [first] = handle.selected;
  switch (command) {
    case "copy":
    case "move":
      return handle.selected.length
        ? {
            kind: "transfer",
            op: command,
            sources: handle.selected,
            targets: others.map((p) => ({ label: title(p.path), path: p.path })),
          }
        : undefined;
    case "mkdir":
      return { kind: "mkdir", dir: handle.path };
    case "rename":
      return first ? { kind: "rename", path: first } : undefined;
    case "delete":
      return handle.selected.length ? { kind: "delete", paths: handle.selected } : undefined;
    default:
      return undefined;
  }
}

/** Several file panels side by side, with copy and move between them, progress, and a preview. */
export function FileCommander(props: FileCommanderProps) {
  const [storages] = useState(() => props.storages ?? newDemoStorages());
  const { files, mounts } = storages;
  const nextId = useRef(0);
  const newPanel = (path: string, selected: string[] = []): PanelState => ({
    id: nextId.current++,
    path,
    selected,
  });
  const [panels, setPanels] = useState(() =>
    (props.panels ?? ["/documents/clients", "/archive/2025"]).map((path, i) =>
      newPanel(path, i === 0 ? (props.initial?.selected ?? []) : []),
    ),
  );
  // Panel ids, the most recently active first: [0] is the active panel.
  const [recent, setRecent] = useState(() => panels.map((p) => p.id));
  const [refreshKey, setRefreshKey] = useState(0);
  const [job, setJob] = useState<Job>();
  const [viewer, setViewer] = useState<Viewer>();
  const [notice, setNotice] = useState<string>();
  const narrow = useNarrow();
  const phone = props.phone || narrow;

  const title = (path: string) =>
    path === "/"
      ? "All storages"
      : dirname(path) === "/"
        ? (mounts.find((m) => `/${m.key}` === path)?.name ?? basename(path))
        : basename(path);
  const others = (id: number) =>
    recent
      .filter((r) => r !== id)
      .map((r) => panels.find((p) => p.id === r))
      .filter((p): p is PanelState => Boolean(p));

  const [dialog, setDialog] = useState<Dialog | undefined>(() => {
    const [first] = panels;
    const command = props.initial?.dialog;
    if (!first || !command) return undefined;
    return dialogFor(
      command,
      { path: first.path, selected: first.selected },
      others(first.id),
      title,
    );
  });

  const activeId = recent[0];
  const activate = (id: number) =>
    setRecent((r) => (r[0] === id ? r : [id, ...r.filter((x) => x !== id)]));
  const update = (id: number, change: Partial<PanelState>) =>
    setPanels((ps) => ps.map((p) => (p.id === id ? { ...p, ...change } : p)));

  const addPanel = (path: string) => {
    const panel = newPanel(path);
    setPanels((ps) => {
      const at = ps.findIndex((p) => p.id === activeId);
      return [...ps.slice(0, at + 1), panel, ...ps.slice(at + 1)];
    });
    setRecent((r) => [panel.id, ...r]);
  };
  const closePanel = (id: number) => {
    setPanels((ps) => ps.filter((p) => p.id !== id));
    setRecent((r) => r.filter((x) => x !== id));
  };

  const refresh = () => setRefreshKey((k) => k + 1);

  const running = Boolean(job && !job.result);

  const transfer = async (source: FilesApi, request: TransferRequest) => {
    if (running) return;
    setDialog(undefined);
    const abort = new AbortController();
    setJob({ op: request.op, abort });
    let written: string[] = [];
    let result: TransferResult;
    try {
      const plan = await planTransfer(source, request);
      if (plan.invalid) throw new Error(plan.invalid);
      result = await runTransfer(source, plan, {
        signal: abort.signal,
        onProgress: (progress) => setJob((j) => j && { ...j, progress }),
      });
      written = plan.steps.filter((s) => result.done.includes(s.from)).map((s) => s.to);
    } catch (e) {
      // Planning failed (an unavailable target, say): nothing was written.
      const problem = problemOf(e);
      result = {
        done: [],
        skipped: [],
        failed: request.sources.map((path) => ({ path, problem })),
        cancelled: false,
      };
    }
    setJob((j) => j && { ...j, result });
    // The target selects what was written; moved items leave their panel's selection.
    const target = normalizePath(request.targetDir);
    setPanels((ps) =>
      ps.map((p) =>
        normalizePath(p.path) === target
          ? { ...p, selected: written }
          : request.op === "move"
            ? { ...p, selected: p.selected.filter((s) => !result.done.includes(s)) }
            : p,
      ),
    );
    refresh();
  };

  const attempt = async (action: () => Promise<unknown>) => {
    setDialog(undefined);
    try {
      await action();
    } catch (e) {
      setNotice(problemOf(e).message);
    }
    refresh();
  };

  const remove = (paths: string[]) =>
    attempt(async () => {
      setPanels((ps) => ps.map((p) => ({ ...p, selected: [] })));
      for (const path of paths) await files.remove(path);
    });

  const download = async (path: string) => {
    const bytes = await readFile(files, path);
    const url = URL.createObjectURL(new Blob([bytes as BlobPart]));
    const link = document.createElement("a");
    link.href = url;
    link.download = basename(path);
    link.click();
    // Revoked a tick later: the browser starts the download after the click returns.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const onCommand = (id: number) => (command: PanelCommand, handle: PanelHandle) => {
    const [first] = handle.selected;
    if (command === "open-in-new-panel" && first) addPanel(first);
    else if (command === "download" && first) attempt(() => download(first));
    else if (command === "copy-path") {
      Promise.resolve()
        .then(() => navigator.clipboard.writeText(handle.selected.join("\n")))
        .then(
          () => setNotice("Path copied."),
          () => setNotice("Couldn't copy the path."),
        );
    } else setDialog(dialogFor(command, handle, others(id), title));
  };

  const dropTargets = (targetDir: string): TransferTarget[] => [
    { label: title(targetDir), path: targetDir },
  ];

  const openFile = async (path: string) => {
    try {
      const stats = await files.stats(path);
      const text = TEXT_TYPES.includes(extname(path)) ? await readText(files, path) : undefined;
      setViewer({ path, size: stats?.kind === "file" ? stats.size : 0, text });
    } catch (e) {
      setNotice(problemOf(e).message);
    }
  };

  // Tab from a panel's list goes to the next panel's list.
  const onPanelKeyDown = (index: number) => (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "Tab" || phone || panels.length < 2) return;
    if ((e.target as HTMLElement).getAttribute("role") !== "grid") return;
    e.preventDefault();
    const next = panels[(index + (e.shiftKey ? -1 : 1) + panels.length) % panels.length];
    if (!next) return;
    activate(next.id);
    e.currentTarget.ownerDocument
      .querySelector<HTMLElement>(`[data-panel="${next.id}"] [role=grid]`)
      ?.focus();
  };

  const renderPanel = (panel: PanelState, index: number) => {
    const name = title(panel.path);
    return (
      <section
        aria-label={name}
        data-panel={panel.id}
        onMouseDown={() => activate(panel.id)}
        onKeyDown={onPanelKeyDown(index)}
        className="flex h-full min-h-0 min-w-0 flex-col gap-1"
      >
        {phone ? null : (
          <div className="flex min-w-0 items-center gap-1 px-1 text-sm">
            <span className="min-w-0 truncate font-medium">{name}</span>
            {panels.length > 1 ? (
              <Button
                variant="ghost"
                size="icon-sm"
                className="ml-auto"
                aria-label={`Close ${name}`}
                title="Close panel"
                onClick={() => closePanel(panel.id)}
              >
                <X className="size-4" />
              </Button>
            ) : null}
          </div>
        )}
        <div className="min-h-0 flex-1">
          <FilePanel
            files={files}
            mounts={mounts}
            path={panel.path}
            onNavigate={(path) => update(panel.id, { path, selected: [] })}
            active={!phone && panels.length > 1 && panel.id === activeId}
            onActivate={() => activate(panel.id)}
            selected={panel.selected}
            onSelect={(selected) => update(panel.id, { selected })}
            refreshKey={refreshKey}
            onOpenFile={openFile}
            onCommand={onCommand(panel.id)}
            onDropPaths={(sources, targetDir, copy) =>
              setDialog({
                kind: "transfer",
                op: copy ? "copy" : "move",
                sources,
                targets: dropTargets(targetDir),
              })
            }
            onDropExternal={async (data, targetDir) => {
              const dropped = await readDropped(data);
              setDialog({
                kind: "transfer",
                op: "copy",
                sources: dropped.paths.map((p) => `/.drop${p}`),
                targets: dropTargets(targetDir),
                external: new CompositeFilesApi(files).mount("/.drop", dropped.files),
              });
            }}
            onProblemAction={() => setNotice("Opens Settings → Storage")}
            phone={phone}
          />
        </div>
      </section>
    );
  };

  const viewerPane = viewer ? (
    <section
      aria-label="Viewer"
      className="flex h-full min-h-0 min-w-0 flex-col rounded-md border bg-background"
    >
      <div className="flex min-w-0 items-center gap-1 border-b p-1 pl-2 text-sm">
        <span className="min-w-0 truncate font-medium">{basename(viewer.path)}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          aria-label="Close viewer"
          onClick={() => setViewer(undefined)}
        >
          <X className="size-4" />
        </Button>
      </div>
      {viewer.text !== undefined ? (
        <pre className="min-h-0 flex-1 overflow-auto p-3 text-sm whitespace-pre-wrap break-words">
          {viewer.text}
        </pre>
      ) : (
        <p className="m-auto p-6 text-center text-sm text-muted-foreground">
          Preview of {basename(viewer.path)} ({formatBytes(viewer.size)})
        </p>
      )}
    </section>
  ) : null;

  const activePanel = panels.find((p) => p.id === activeId) ?? panels[0];

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2">
      <div className="flex min-w-0 items-center gap-1">
        {phone ? (
          <div role="tablist" aria-label="Panels" className="flex min-w-0 gap-1 overflow-x-auto">
            {panels.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={p.id === activePanel?.id && !viewer}
                onClick={() => {
                  setViewer(undefined);
                  activate(p.id);
                }}
                className={cn(
                  "shrink-0 rounded-md px-2 py-1 text-sm",
                  p.id === activePanel?.id && !viewer
                    ? "bg-accent font-medium"
                    : "hover:bg-accent/50",
                )}
              >
                {title(p.path)}
              </button>
            ))}
          </div>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto shrink-0"
          onClick={() => activePanel && addPanel(activePanel.path)}
        >
          <Plus className="size-4" /> New panel
        </Button>
        {phone && panels.length > 1 && activePanel ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Close ${title(activePanel.path)}`}
            onClick={() => closePanel(activePanel.id)}
          >
            <X className="size-4" />
          </Button>
        ) : null}
      </div>

      {notice ? (
        <div className="flex items-center gap-2 rounded-md border bg-muted px-2 py-1 text-sm">
          <span className="min-w-0">{notice}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto"
            aria-label="Dismiss"
            onClick={() => setNotice(undefined)}
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        {phone ? (
          (viewerPane ?? (activePanel ? renderPanel(activePanel, 0) : null))
        ) : (
          <ResizablePanelGroup orientation="horizontal">
            {panels.map((panel, i) => (
              <Fragment key={panel.id}>
                {i > 0 ? <ResizableHandle className="mx-1" /> : null}
                <ResizablePanel id={`panel-${panel.id}`} minSize={200}>
                  {renderPanel(panel, i)}
                </ResizablePanel>
              </Fragment>
            ))}
            {viewerPane ? (
              <>
                <ResizableHandle className="mx-1" />
                <ResizablePanel id="viewer" minSize={200}>
                  {viewerPane}
                </ResizablePanel>
              </>
            ) : null}
          </ResizablePanelGroup>
        )}
      </div>

      {job ? (
        <ProgressStrip
          op={job.op}
          progress={job.progress}
          result={job.result}
          onCancel={() => job.abort.abort()}
          onClose={() => setJob(undefined)}
        />
      ) : null}

      {dialog?.kind === "transfer" ? (
        <TransferDialog
          op={dialog.op}
          sources={dialog.sources}
          targets={dialog.targets}
          files={dialog.external ?? files}
          external={Boolean(dialog.external)}
          busy={running}
          onConfirm={(request) => transfer(dialog.external ?? files, request)}
          onCancel={() => setDialog(undefined)}
          onProblemAction={() => setNotice("Opens Settings → Storage")}
        />
      ) : dialog?.kind === "mkdir" ? (
        <NewFolderDialog
          files={files}
          dir={dialog.dir}
          onConfirm={(name) => attempt(() => files.mkdir(joinPath(dialog.dir, name)))}
          onCancel={() => setDialog(undefined)}
        />
      ) : dialog?.kind === "rename" ? (
        <RenameDialog
          files={files}
          path={dialog.path}
          onConfirm={(name) =>
            attempt(async () => {
              // The dialog checked the name when it opened; it may be taken since.
              const to = joinPath(dirname(dialog.path), name);
              if (await files.exists(to)) throw new Error(`${name} already exists here.`);
              if (!(await files.move(dialog.path, to))) throw new Error("It no longer exists.");
            })
          }
          onCancel={() => setDialog(undefined)}
        />
      ) : dialog?.kind === "delete" ? (
        <DeleteDialog
          paths={dialog.paths}
          onConfirm={() => remove(dialog.paths)}
          onCancel={() => setDialog(undefined)}
        />
      ) : null}
    </div>
  );
}
