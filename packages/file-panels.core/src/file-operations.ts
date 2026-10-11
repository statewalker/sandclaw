// The operations a panel offers, each reporting what it changed on the one
// change stream: panels refresh from it, an indexer will follow it.
import type { FileChange, FileChangesHub } from "@statewalker/file-mounts.core";
import type { FilesApi } from "@statewalker/webrun-files";
import { dirname, joinPath } from "@statewalker/webrun-files";
import { CompositeFilesApi } from "@statewalker/webrun-files-composite";
import {
  planTransfer,
  type TransferPlan,
  type TransferRequest,
  validateName,
} from "./transfer-plan.js";
import { runTransfer, type TransferProgress, type TransferResult } from "./transfer-run.js";

/** Where a foreign source is mounted while a transfer runs. */
const DROP = "/.drop";

export class FileOperations {
  constructor(
    readonly files: FilesApi,
    readonly changes: FileChangesHub,
  ) {}

  /**
   * Plans and runs a copy or move. `source` is a foreign source (a desktop drop): its
   * paths are taken from it, mounted at `/.drop` beside these files for the run.
   */
  async transfer(
    request: TransferRequest,
    opts: { source?: FilesApi; signal?: AbortSignal; onProgress?(p: TransferProgress): void } = {},
  ): Promise<{ plan: TransferPlan; result: TransferResult }> {
    const { source } = opts;
    const files = source ? new CompositeFilesApi(this.files).mount(DROP, source) : this.files;
    if (source) request = { ...request, sources: request.sources.map((s) => joinPath(DROP, s)) };
    const plan = await planTransfer(files, request);
    if (plan.invalid) throw new Error(plan.invalid);
    const result = await runTransfer(files, plan, opts);
    const failed = new Set(result.failed.map((f) => f.path));
    const changes: FileChange[] = [];
    for (const step of plan.steps) {
      const done = result.done.includes(step.from);
      // A failed step may have written its target or cleaned part of its source: look.
      const target = done || !failed.has(step.from) ? done : await this.probe(step.to);
      if (target === false) continue;
      const written = step.overwrite ? "updated" : "added";
      changes.push({ type: target === undefined ? "updated" : written, path: step.to });
      // Source-side paths of a foreign source mean nothing to listeners.
      if (step.op !== "move" || source) continue;
      const stays = !done && (await this.probe(step.from)) !== false;
      changes.push({ type: stays ? "updated" : "deleted", path: step.from });
    }
    this.changes.emit(changes);
    return { plan, result };
  }

  /** Whether `path` exists; `undefined` when its storage went away mid-run and can't say. */
  private async probe(path: string): Promise<boolean | undefined> {
    try {
      return await this.files.exists(path);
    } catch {
      return undefined;
    }
  }

  async mkdir(dir: string, name: string): Promise<string> {
    const path = await this.freePath(dir, name);
    await this.files.mkdir(path);
    this.changes.emit([{ type: "added", path }]);
    return path;
  }

  /** Never replaces: a name taken since the dialog opened is refused. */
  async rename(path: string, name: string): Promise<string> {
    const to = await this.freePath(dirname(path), name);
    if (!(await this.files.move(path, to))) throw new Error("It no longer exists.");
    this.changes.emit([
      { type: "deleted", path },
      { type: "added", path: to },
    ]);
    return to;
  }

  /** Reports the paths actually removed, even when a later one fails. */
  async remove(paths: string[]): Promise<void> {
    const removed: FileChange[] = [];
    try {
      for (const path of paths) {
        if (await this.files.remove(path)) removed.push({ type: "deleted", path });
      }
    } finally {
      this.changes.emit(removed);
    }
  }

  private async freePath(dir: string, name: string): Promise<string> {
    const invalid = validateName(name);
    if (invalid) throw new Error(invalid);
    const path = joinPath(dir, name);
    if (await this.files.exists(path)) throw new Error(`${name} already exists here.`);
    return path;
  }
}
