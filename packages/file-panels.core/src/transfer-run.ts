// Runs a planned copy or move: byte progress per chunk, cancel in the middle
// of a file, and a target that is replaced only by a complete copy.

import { type Problem, problemOf } from "@statewalker/file-mounts.core";
import type { FilesApi } from "@statewalker/webrun-files";
import { basename, dirname, joinPath, normalizePath } from "@statewalker/webrun-files";
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

const firstSegment = (path: string) => path.split("/")[1] ?? "";

interface FileJob {
  from: string;
  /** The path below the step's target; "" for a step that is one file. */
  rel: string;
  size: number;
  /** With `size`, tells whether the file changed after it was copied. */
  lastModified: number;
}
interface StepContent {
  files: FileJob[];
  /** Every folder to recreate below the target (empty ones too); "" is the target itself. */
  dirs: string[];
}

/** What a step moves: its files and folders, relative to the step's source. */
async function contentOf(files: FilesApi, step: TransferStep): Promise<StepContent> {
  const stats = await files.stats(step.from);
  if (!stats) throw new Error("It no longer exists.");
  if (stats.kind === "file")
    return {
      files: [{ from: step.from, rel: "", size: stats.size, lastModified: stats.lastModified }],
      dirs: [],
    };
  const out: StepContent = { files: [], dirs: [""] };
  for await (const e of files.list(step.from, { recursive: true })) {
    const rel = e.path.slice(step.from.length);
    if (e.kind === "file")
      out.files.push({ from: e.path, rel, size: e.size, lastModified: e.lastModified });
    else out.dirs.push(rel);
  }
  return out;
}

/** A step onto its own source, or into it, would destroy the source while "succeeding". */
function intoItself(step: TransferStep): boolean {
  const from = normalizePath(step.from);
  const to = normalizePath(step.to);
  return to === from || to.startsWith(`${from}/`);
}

const randomSuffix = () => Math.random().toString(36).slice(2, 10);
const sibling = (path: string, tag: string) =>
  joinPath(dirname(path), `.${basename(path)}.${tag}-${randomSuffix()}`);

/** A false result from copy, move or remove means the source was not there. */
function must(done: boolean) {
  if (!done) throw new Error("It no longer exists.");
}

/** Something took the target's name after planning: without an overwrite it is never replaced. */
async function refuseTaken(files: FilesApi, to: string) {
  if (await files.exists(to)) {
    throw new Error(`${basename(to)} appeared there meanwhile; nothing was replaced.`);
  }
}

/**
 * Puts a complete `tmp` in place of `to`; the old `to` is set aside and restored if the
 * swap fails. Without `overwrite`, a `to` that appeared meanwhile fails the step instead.
 */
async function swapIn(files: FilesApi, tmp: string, to: string, overwrite: boolean) {
  if (!overwrite) await refuseTaken(files, to);
  if (!(await files.exists(to))) {
    must(await files.move(tmp, to));
    return;
  }
  const aside = sibling(to, "old");
  must(await files.move(to, aside));
  try {
    must(await files.move(tmp, to));
  } catch (e) {
    await quietly(() => files.remove(to));
    let restored = false;
    await quietly(async () => {
      restored = await files.move(aside, to);
    });
    // The old target still exists under its hidden name: the message must say where.
    if (!restored) throw new Error(`${problemOf(e).message} The old version is kept as ${aside}.`);
    throw e;
  }
  await quietly(() => files.remove(aside));
}

/**
 * Removes a moved source, but only what was copied: a file added or changed at the
 * source while the copy ran stays there, and the step fails saying so.
 */
async function removeMoved(files: FilesApi, from: string, content: StepContent) {
  for (const job of content.files) {
    const now = await files.stats(job.from);
    if (now?.kind === "file" && now.size === job.size && now.lastModified === job.lastModified) {
      must(await files.remove(job.from));
    }
  }
  // Folders deepest first, each only once nothing is left in it.
  const dirs = content.dirs.map((d) => joinPath(from, d)).sort((a, b) => b.length - a.length);
  for (const dir of dirs) {
    let empty = true;
    for await (const _ of files.list(dir)) {
      empty = false;
      break;
    }
    if (empty) await files.remove(dir);
  }
  if (await files.exists(from)) {
    throw new Error(
      `It changed during the move: the copy is done, and ${from} keeps what changed.`,
    );
  }
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

  // 1. Sizes up front, so progress has a total; a step that cannot be run fails now.
  const contents = new Map<TransferStep, StepContent>();
  let bytesTotal = 0;
  for (const step of plan.steps) {
    try {
      if (intoItself(step)) throw new Error("An item can't be copied or moved into itself.");
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

  // Streams one file; returns false when cancelled.
  const copyFile = async (from: string, to: string): Promise<boolean> => {
    let stopped = false;
    async function* chunks() {
      for await (const chunk of files.read(from, { signal })) {
        if (signal?.aborted) {
          stopped = true;
          return;
        }
        bytesDone += chunk.length;
        report(from);
        yield chunk;
      }
    }
    await files.write(to, chunks());
    return !(stopped || signal?.aborted);
  };

  // Across mounts: the whole file or folder is written under a temporary sibling name and
  // swapped in only when complete, so a cancel or a failure leaves nothing partial under the
  // real name, and an overwritten folder is replaced, not merged. Returns false when cancelled.
  const acrossMounts = async (step: TransferStep, content: StepContent): Promise<boolean> => {
    const tmp = sibling(step.to, "part");
    try {
      for (const dir of content.dirs) await files.mkdir(joinPath(tmp, dir));
      for (const job of content.files) {
        if (!(await copyFile(job.from, joinPath(tmp, job.rel)))) {
          await quietly(() => files.remove(tmp));
          return false;
        }
      }
      await swapIn(files, tmp, step.to, step.overwrite);
    } catch (e) {
      await quietly(() => files.remove(tmp));
      throw e;
    }
    if (step.op === "move") await removeMoved(files, step.from, content);
    return true;
  };

  // Same mount: the backend copies or moves; an overwrite goes through a temporary sibling.
  const inMount = async (step: TransferStep, content: StepContent) => {
    if (!step.overwrite) {
      await refuseTaken(files, step.to);
      must(
        await (step.op === "move"
          ? files.move(step.from, step.to)
          : files.copy(step.from, step.to)),
      );
    } else {
      const tmp = sibling(step.to, "part");
      try {
        must(await files.copy(step.from, tmp));
        await swapIn(files, tmp, step.to, true);
      } catch (e) {
        await quietly(() => files.remove(tmp));
        throw e;
      }
      if (step.op === "move") await removeMoved(files, step.from, content);
    }
    bytesDone += content.files.reduce((n, j) => n + j.size, 0);
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
        await inMount(step, content);
      } else if (!(await acrossMounts(step, content))) {
        // 3. Cancelled: nothing of this step is left behind.
        result.cancelled = true;
        return result;
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
