// Runs a planned copy or move: byte progress per chunk, cancel in the middle
// of a file, and an overwrite that replaces the old file only with a complete copy.
import type { FilesApi } from "@statewalker/webrun-files";
import { basename, dirname, joinPath } from "@statewalker/webrun-files";
import { MountUnavailable, type Problem } from "./problem.js";
import type { TransferPlan, TransferStep } from "./transfer-plan.js";

export interface TransferProgress {
  file: string;
  bytesDone: number;
  bytesTotal: number;
  itemsDone: number;
  itemsTotal: number;
}
export interface TransferResult {
  done: string[];
  skipped: string[];
  failed: { path: string; problem: Problem }[];
  cancelled: boolean;
}

export function problemOf(error: unknown): Problem {
  if (error instanceof MountUnavailable) return error.problem;
  return { cause: "unknown", message: error instanceof Error ? error.message : String(error) };
}

const firstSegment = (path: string) => path.split("/")[1] ?? "";

interface FileJob {
  from: string;
  to: string;
  size: number;
}

/** Each file of a step as [source, target]; a file step is itself, an empty folder has none. */
async function filesOf(files: FilesApi, step: TransferStep): Promise<FileJob[]> {
  const stats = await files.stats(step.from);
  if (!stats) throw new Error(`${basename(step.from)} no longer exists.`);
  if (stats.kind === "file") return [{ from: step.from, to: step.to, size: stats.size }];
  const out: FileJob[] = [];
  for await (const e of files.list(step.from, { recursive: true })) {
    if (e.kind === "file") {
      out.push({
        from: e.path,
        to: joinPath(step.to, e.path.slice(step.from.length)),
        size: e.size,
      });
    }
  }
  return out;
}

const quietly = async (action: () => Promise<unknown>) => {
  try {
    await action();
  } catch {
    /* best effort cleanup */
  }
};

export async function runTransfer(
  files: FilesApi,
  plan: TransferPlan,
  opts: {
    signal?: AbortSignal;
    onProgress?: (p: TransferProgress) => void;
    mountOf?: (path: string) => string;
  } = {},
): Promise<TransferResult> {
  const { signal } = opts;
  const mountOf = opts.mountOf ?? firstSegment;
  const result: TransferResult = {
    done: [],
    skipped: [...plan.skipped],
    failed: [],
    cancelled: false,
  };

  // 1. Sizes up front, so progress has a total; a step that cannot be read fails now.
  const jobs = new Map<TransferStep, FileJob[]>();
  let bytesTotal = 0;
  for (const step of plan.steps) {
    try {
      const list = await filesOf(files, step);
      jobs.set(step, list);
      for (const j of list) bytesTotal += j.size;
    } catch (e) {
      result.failed.push({ path: step.from, problem: problemOf(e) });
    }
  }

  let bytesDone = 0;
  let itemsDone = 0;
  const itemsTotal = jobs.size;
  const report = (file: string) =>
    opts.onProgress?.({ file, bytesDone, bytesTotal, itemsDone, itemsTotal });

  // Streams one file; returns false when cancelled (the incomplete file is removed).
  const copyFile = async (job: FileJob, overwrite: boolean): Promise<boolean> => {
    const tmp = overwrite
      ? joinPath(
          dirname(job.to),
          `.${basename(job.to)}.part-${Math.random().toString(36).slice(2, 10)}`,
        )
      : job.to;
    let stopped = false;
    async function* chunks() {
      for await (const chunk of files.read(job.from, { signal })) {
        if (signal?.aborted) {
          stopped = true;
          return;
        }
        bytesDone += chunk.length;
        report(job.from);
        yield chunk;
        if (signal?.aborted) {
          stopped = true;
          return;
        }
      }
    }
    try {
      await files.write(tmp, chunks());
      if (stopped || signal?.aborted) {
        await quietly(() => files.remove(tmp));
        return false;
      }
      if (overwrite) {
        if (await files.exists(job.to)) await files.remove(job.to);
        await files.move(tmp, job.to);
      }
      return true;
    } catch (e) {
      await quietly(() => files.remove(tmp));
      throw e;
    }
  };

  // 2. Step by step.
  for (const step of plan.steps) {
    const list = jobs.get(step);
    if (!list) continue;
    if (signal?.aborted) {
      result.cancelled = true;
      return result;
    }
    try {
      if (mountOf(step.from) === mountOf(step.to)) {
        if (step.overwrite && (await files.exists(step.to))) await files.remove(step.to);
        await (step.op === "move"
          ? files.move(step.from, step.to)
          : files.copy(step.from, step.to));
        bytesDone += list.reduce((n, j) => n + j.size, 0);
      } else {
        if (list.length === 0) await files.mkdir(step.to);
        for (const job of list) {
          if (!(await copyFile(job, step.overwrite))) {
            // 3. Cancelled: nothing of this step stays as if complete.
            result.cancelled = true;
            return result;
          }
        }
        if (step.op === "move") await files.remove(step.from);
      }
      itemsDone++;
      result.done.push(step.from);
      report(step.from);
    } catch (e) {
      // 4. This step failed; the next one runs.
      result.failed.push({ path: step.from, problem: problemOf(e) });
    }
  }
  return result;
}
