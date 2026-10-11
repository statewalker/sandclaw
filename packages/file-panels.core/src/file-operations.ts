// The operations a panel offers, each reporting what it changed on the one
// change stream: panels refresh from it, an indexer will follow it.
import type { FileChange, FileChangesHub } from "@statewalker/file-mounts.core";
import type { FilesApi } from "@statewalker/webrun-files";
import { dirname, joinPath } from "@statewalker/webrun-files";
import {
  planTransfer,
  type TransferPlan,
  type TransferRequest,
  validateName,
} from "./transfer-plan.js";
import { runTransfer, type TransferProgress, type TransferResult } from "./transfer-run.js";

export class FileOperations {
  constructor(
    readonly files: FilesApi,
    readonly changes: FileChangesHub,
  ) {}

  /** Plans and runs a copy or move; `files` is another source (a desktop drop). */
  async transfer(
    request: TransferRequest,
    opts: { files?: FilesApi; signal?: AbortSignal; onProgress?(p: TransferProgress): void } = {},
  ): Promise<{ plan: TransferPlan; result: TransferResult }> {
    const files = opts.files ?? this.files;
    const foreign = files !== this.files;
    const plan = await planTransfer(files, request);
    if (plan.invalid) throw new Error(plan.invalid);
    const result = await runTransfer(files, plan, opts);
    const failed = new Set(result.failed.map((f) => f.path));
    const changes: FileChange[] = [];
    for (const step of plan.steps) {
      const done = result.done.includes(step.from);
      // A failed step may have written its target or cleaned part of its source: look.
      if (!done && !(failed.has(step.from) && (await this.files.exists(step.to)))) continue;
      changes.push({ type: step.overwrite ? "updated" : "added", path: step.to });
      // Source-side paths of a foreign source (a drop mount) mean nothing to listeners.
      if (step.op !== "move" || foreign) continue;
      const stays = !done && (await this.files.exists(step.from));
      changes.push({ type: stays ? "updated" : "deleted", path: step.from });
    }
    this.changes.emit(changes);
    return { plan, result };
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
