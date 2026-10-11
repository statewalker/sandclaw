// The commander's state and actions, shared by the two presentations: panels
// side by side (file-commander.tsx) and panels as dock tabs (dock-commander.tsx).
// Each presentation lays the panels out; everything else lives here.
import { newFileChanges, problemOf } from "@statewalker/file-mounts.core";
import {
  FileOperations,
  importDropped,
  type TransferOp,
  type TransferProgress,
  type TransferRequest,
  type TransferResult,
} from "@statewalker/file-panels.core";
import { Button } from "@statewalker/ui.view.shadcn";
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
import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatBytes } from "../browser-data/storage.js";
import { newDemoStorages } from "./demo-storages.js";
import { DeleteDialog, NewFolderDialog, RenameDialog } from "./file-dialogs.js";
import type { FilePanelProps, PanelCommand, PanelHandle, PanelView } from "./file-panel.js";
import { ProgressStrip } from "./progress-strip.js";
import { TransferDialog, type TransferTarget } from "./transfer-dialog.js";

export type Storages = ReturnType<typeof newDemoStorages>;

/** A panel to open with: its folder, or its folder and view. */
export type PanelSpec = string | { path: string; view?: PanelView; dock?: false };

export interface CommanderOptions {
  storages?: Storages;
  /** The panels, in order: each a folder, or a folder and its view. */
  panels?: PanelSpec[];
  /** Opens with these items selected in the first panel, and this dialog shown. */
  initial?: { dialog?: "copy" | "move" | "delete" | "rename" | "mkdir"; selected?: string[] };
}

export interface PanelState {
  id: string;
  path: string;
  selected: string[];
  /** The view it opens in. */
  view?: PanelView;
  /** False: shown by its owner (a side bar), not placed in the dock with the others. */
  dock?: false;
}

type Dialog =
  | {
      kind: "transfer";
      op: TransferOp;
      sources: string[];
      targets: TransferTarget[];
      /** Desktop drop: the dropped files, and the workspace with them at `/.drop` for the preview. */
      drop?: { files: FilesApi; view: FilesApi };
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

/** A file opened from a panel. */
export interface Viewer {
  path: string;
  size: number;
  text?: string;
}

/** Where the dialog's preview shows a desktop drop beside the storages. */
const DROP = "/.drop";

const TEXT_TYPES = [".md", ".txt", ".json", ".csv"];
const NARROW = "(max-width: 639px)";

export function useNarrow(): boolean {
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

export type Commander = ReturnType<typeof useCommander>;

export function useCommander(props: CommanderOptions) {
  const [storages] = useState(() => props.storages ?? newDemoStorages());
  const { files, mounts } = storages;
  const nextId = useRef(0);
  const newPanel = (spec: PanelSpec, selected: string[] = []): PanelState => ({
    id: `files-${nextId.current++}`,
    ...(typeof spec === "string" ? { path: spec } : spec),
    selected,
  });
  const [panels, setPanels] = useState(() =>
    (props.panels ?? ["/documents/clients", "/archive/2025"]).map((spec, i) =>
      newPanel(spec, i === 0 ? (props.initial?.selected ?? []) : []),
    ),
  );
  // Panel ids, the most recently active first: [0] is the active panel.
  const [recent, setRecent] = useState(() => panels.map((p) => p.id));
  const [refreshKey, setRefreshKey] = useState(0);
  const [job, setJob] = useState<Job>();
  const [viewer, setViewer] = useState<Viewer>();
  const [notice, setNotice] = useState<string>();

  const title = (path: string) =>
    path === "/"
      ? "All storages"
      : dirname(path) === "/"
        ? (mounts.find((m) => `/${m.key}` === path)?.name ?? basename(path))
        : basename(path);
  const others = (id: string) =>
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
  const activate = (id: string) =>
    setRecent((r) => (r[0] === id ? r : [id, ...r.filter((x) => x !== id)]));
  const update = (id: string, change: Partial<PanelState>) =>
    setPanels((ps) => ps.map((p) => (p.id === id ? { ...p, ...change } : p)));

  const addPanel = (path: string) => {
    const panel = newPanel(path);
    setPanels((ps) => {
      const at = ps.findIndex((p) => p.id === activeId);
      return [...ps.slice(0, at + 1), panel, ...ps.slice(at + 1)];
    });
    setRecent((r) => [panel.id, ...r]);
  };
  const closePanel = (id: string) => {
    setPanels((ps) => ps.filter((p) => p.id !== id));
    setRecent((r) => r.filter((x) => x !== id));
  };

  const refresh = () => setRefreshKey((k) => k + 1);

  const ops = useMemo(() => new FileOperations(files, newFileChanges()), [files]);

  const running = Boolean(job && !job.result);

  const transfer = async (request: TransferRequest, source?: FilesApi) => {
    if (running) return;
    setDialog(undefined);
    const abort = new AbortController();
    setJob({ op: request.op, abort });
    let written: string[] = [];
    let result: TransferResult;
    try {
      const done = await ops.transfer(request, {
        source,
        signal: abort.signal,
        onProgress: (progress) => setJob((j) => j && { ...j, progress }),
      });
      const { plan } = done;
      result = done.result;
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
      await ops.remove(paths);
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

  // "New note": an empty Untitled.md (or "Untitled (2).md"…) in the folder, then Rename on it.
  const newNote = (dir: string) =>
    attempt(async () => {
      let name = "Untitled.md";
      for (let n = 2; await files.exists(joinPath(dir, name)); n++) name = `Untitled (${n}).md`;
      const note = joinPath(dir, name);
      await files.write(note, [new Uint8Array()]);
      setPanels((ps) => ps.map((p) => (p.path === dir ? { ...p, selected: [note] } : p)));
      setDialog({ kind: "rename", path: note });
    });

  // "Add files…": the computer's file picker, then the same Copy dialog as a desktop drop.
  const picker = useRef<HTMLInputElement>(null);
  const pickInto = useRef("/");
  const addFiles = (dir: string) => {
    pickInto.current = dir;
    picker.current?.click();
  };

  const offerDrop = async (data: Pick<DataTransfer, "items" | "files">, targetDir: string) => {
    const dropped = await importDropped(data as DataTransfer);
    setDialog({
      kind: "transfer",
      op: "copy",
      sources: dropped.paths.map((p) => `${DROP}${p}`),
      targets: dropTargets(targetDir),
      drop: {
        files: dropped.files,
        view: new CompositeFilesApi(files).mount(DROP, dropped.files),
      },
    });
  };

  const onCommand = (id: string) => (command: PanelCommand, handle: PanelHandle) => {
    const [first] = handle.selected;
    if (command === "new-note") newNote(handle.path);
    else if (command === "add-files") addFiles(handle.path);
    else if (command === "open-in-new-panel" && first) addPanel(first);
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

  /** What a panel's `FilePanel` needs; the presentation adds `active`, `phone` and its frame. */
  const panelProps = (panel: PanelState): FilePanelProps => ({
    files,
    mounts,
    path: panel.path,
    onNavigate: (path) => update(panel.id, { path, selected: [] }),
    onActivate: () => activate(panel.id),
    selected: panel.selected,
    onSelect: (selected) => update(panel.id, { selected }),
    refreshKey,
    onOpenFile: openFile,
    onCommand: onCommand(panel.id),
    onDropPaths: (sources, targetDir, copy) =>
      setDialog({
        kind: "transfer",
        op: copy ? "copy" : "move",
        sources,
        targets: dropTargets(targetDir),
      }),
    onDropExternal: offerDrop,
    initialView: panel.view,
    onProblemAction: () => setNotice("Opens Settings → Storage"),
  });

  const noticeBar = notice ? (
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
  ) : null;

  const progressStrip = job ? (
    <ProgressStrip
      op={job.op}
      progress={job.progress}
      result={job.result}
      onCancel={() => job.abort.abort()}
      onClose={() => setJob(undefined)}
    />
  ) : null;

  const filePicker = (
    <input
      ref={picker}
      type="file"
      multiple
      hidden
      aria-label="Files to add"
      onChange={(e) => {
        const input = e.currentTarget;
        const chosen = Array.from(input.files ?? []);
        input.value = "";
        if (chosen.length)
          offerDrop(
            { items: [] as unknown as DataTransferItemList, files: chosen as unknown as FileList },
            pickInto.current,
          );
      }}
    />
  );

  const dialogs =
    dialog?.kind === "transfer" ? (
      <TransferDialog
        op={dialog.op}
        sources={dialog.sources}
        targets={dialog.targets}
        files={dialog.drop?.view ?? files}
        external={Boolean(dialog.drop)}
        busy={running}
        onConfirm={(request) => {
          const { drop } = dialog;
          if (!drop) return transfer(request);
          // The dialog previews against the workspace view; the run takes the drop's own paths.
          const sources = request.sources.map((s) => s.slice(DROP.length));
          return transfer({ ...request, sources }, drop.files);
        }}
        onCancel={() => setDialog(undefined)}
        onProblemAction={() => setNotice("Opens Settings → Storage")}
      />
    ) : dialog?.kind === "mkdir" ? (
      <NewFolderDialog
        files={files}
        dir={dialog.dir}
        onConfirm={(name) => attempt(() => ops.mkdir(dialog.dir, name))}
        onCancel={() => setDialog(undefined)}
      />
    ) : dialog?.kind === "rename" ? (
      <RenameDialog
        files={files}
        path={dialog.path}
        onConfirm={(name) => attempt(() => ops.rename(dialog.path, name))}
        onCancel={() => setDialog(undefined)}
      />
    ) : dialog?.kind === "delete" ? (
      <DeleteDialog
        paths={dialog.paths}
        onConfirm={() => remove(dialog.paths)}
        onCancel={() => setDialog(undefined)}
      />
    ) : null;

  return {
    panels,
    activeId,
    activate,
    addPanel,
    closePanel,
    title,
    panelProps,
    viewer,
    setViewer,
    noticeBar,
    progressStrip,
    dialogs: (
      <>
        {filePicker}
        {dialogs}
      </>
    ),
  };
}

/** A file's text, or a stand-in for formats the prototype doesn't render. */
export function ViewerBody({ viewer }: { viewer: Viewer }) {
  return viewer.text !== undefined ? (
    <pre className="min-h-0 flex-1 overflow-auto p-3 text-sm whitespace-pre-wrap break-words">
      {viewer.text}
    </pre>
  ) : (
    <p className="m-auto p-6 text-center text-sm text-muted-foreground">
      Preview of {basename(viewer.path)} ({formatBytes(viewer.size)})
    </p>
  );
}
