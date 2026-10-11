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
interface StepContent {
  files: FileJob[];
  dirs: string[];
}

/** What a step moves: its files as [source, target] and every folder to recreate (empty ones too). */
async function contentOf(files: FilesApi, step: TransferStep): Promise<StepContent> {
  const stats = await files.stats(step.from);
  if (!stats) throw new Error(`${basename(step.from)} no longer exists.`);
  if (stats.kind === "file")
    return { files: [{ from: step.from, to: step.to, size: stats.size }], dirs: [] };
  const out: StepContent = { files: [], dirs: [step.to] };
  for await (const e of files.list(step.from, { recursive: true })) {
    const to = joinPath(step.to, e.path.slice(step.from.length));
    if (e.kind === "file") out.files.push({ from: e.path, to, size: e.size });
    else out.dirs.push(to);
  }
  return out;
}

const randomSuffix = () => Math.random().toString(36).slice(2, 10);
const sibling = (path: string, tag: string) =>
  joinPath(dirname(path), `.${basename(path)}.${tag}-${randomSuffix()}`);

/** A false result from copy, move or remove means the source was not there. */
function must(done: boolean, from: string) {
  if (!done) throw new Error(`${basename(from)} no longer exists.`);
}

/** Puts a complete `tmp` in place of `to`; the old `to` is set aside and restored if the swap fails. */
async function swapIn(files: FilesApi, tmp: string, to: string) {
  if (!(await files.exists(to))) {
    must(await files.move(tmp, to), tmp);
    return;
  }
  const aside = sibling(to, "old");
  must(await files.move(to, aside), to);
  try {
    must(await files.move(tmp, to), tmp);
  } catch (e) {
    await quietly(() => files.remove(to));
    await quietly(() => files.move(aside, to));
    throw e;
  }
  await quietly(() => files.remove(aside));
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
  const contents = new Map<TransferStep, StepContent>();
  let bytesTotal = 0;
  for (const step of plan.steps) {
    try {
      const content = await contentOf(files, step);
      contents.set(step, content);
      for (const j of content.files) bytesTotal += j.size;
    } catch (e) {
      result.failed.push({ path: step.from, problem: problemOf(e) });
    }
  }

  let bytesDone = 0;
  let itemsDone = 0;
  const itemsTotal = contents.size;
  const report = (file: string) =>
    opts.onProgress?.({ file, bytesDone, bytesTotal, itemsDone, itemsTotal });

  // Streams one file; returns false when cancelled (the incomplete file is removed).
  const copyFile = async (job: FileJob, overwrite: boolean): Promise<boolean> => {
    const tmp = overwrite ? sibling(job.to, "part") : job.to;
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
      }
    }
    try {
      await files.write(tmp, chunks());
      if (stopped || signal?.aborted) {
        await quietly(() => files.remove(tmp));
        return false;
      }
      if (overwrite) await swapIn(files, tmp, job.to);
      return true;
    } catch (e) {
      await quietly(() => files.remove(tmp));
      throw e;
    }
  };

  // Same mount: the backend copies or moves; an overwrite goes through a temporary sibling.
  const inMount = async (step: TransferStep, size: number) => {
    if (!step.overwrite) {
      must(
        await (step.op === "move"
          ? files.move(step.from, step.to)
          : files.copy(step.from, step.to)),
        step.from,
      );
    } else {
      const tmp = sibling(step.to, "part");
      try {
        must(await files.copy(step.from, tmp), step.from);
        await swapIn(files, tmp, step.to);
      } catch (e) {
        await quietly(() => files.remove(tmp));
        throw e;
      }
      if (step.op === "move") must(await files.remove(step.from), step.from);
    }
    bytesDone += size;
  };

  // 2. Step by step.
  for (const step of plan.steps) {
    const content = contents.get(step);
    if (!content) continue;
    if (signal?.aborted) {
      result.cancelled = true;
      return result;
    }
    try {
      if (mountOf(step.from) === mountOf(step.to)) {
        await inMount(
          step,
          content.files.reduce((n, j) => n + j.size, 0),
        );
      } else {
        for (const dir of content.dirs) await files.mkdir(dir);
        for (const job of content.files) {
          if (!(await copyFile(job, step.overwrite))) {
            // 3. Cancelled: nothing of this step stays as if complete.
            result.cancelled = true;
            return result;
          }
        }
        if (step.op === "move") must(await files.remove(step.from), step.from);
      }
      itemsDone++;
      result.done.push(step.from);
      report(step.from);
    } catch (e) {
      // An abort raised as an exception is a cancel; any other error fails this step only.
      if (signal?.aborted) {
        result.cancelled = true;
        return result;
      }
      result.failed.push({ path: step.from, problem: problemOf(e) });
    }
  }
  return result;
}
