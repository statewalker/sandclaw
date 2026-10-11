// What a copy or move will do, decided before anything is written: the
// dialog shows the clashes, the runner executes the steps.
import type { FilesApi } from "@statewalker/webrun-files";
import { basename, dirname, extname, joinPath } from "@statewalker/webrun-files";

export type TransferOp = "copy" | "move";
export type ClashPolicy = "overwrite" | "keep-both" | "skip";

export interface TransferRequest {
  op: TransferOp;
  sources: string[];
  targetDir: string;
  rename?: string;
  clash: ClashPolicy;
}
export interface TransferStep {
  op: TransferOp;
  from: string;
  to: string;
  overwrite: boolean;
}
export interface TransferPlan {
  steps: TransferStep[];
  skipped: string[];
  clashes: string[];
  invalid?: string;
}

async function namesIn(files: FilesApi, dir: string): Promise<Set<string>> {
  const names = new Set<string>();
  for await (const e of files.list(dir)) names.add(e.name);
  return names;
}

export async function findClashes(
  files: FilesApi,
  sources: string[],
  targetDir: string,
): Promise<string[]> {
  const taken = await namesIn(files, targetDir);
  return sources
    .filter((s) => dirname(s) !== targetDir && taken.has(basename(s)))
    .map((s) => basename(s));
}

export async function planTransfer(files: FilesApi, req: TransferRequest): Promise<TransferPlan> {
  const into = (s: string) => req.targetDir === s || req.targetDir.startsWith(`${s}/`);
  if (req.sources.some(into)) {
    return {
      steps: [],
      skipped: [],
      clashes: [],
      invalid: "A folder can't be copied or moved into itself.",
    };
  }
  const existing = await namesIn(files, req.targetDir);
  const planned = new Set<string>();
  const plan: TransferPlan = { steps: [], skipped: [], clashes: [] };
  for (const from of req.sources) {
    let name = (req.sources.length === 1 && req.rename) || basename(from);
    let op = req.op;
    let overwrite = false;
    if (dirname(from) === req.targetDir && name === basename(from)) {
      // Dropped where it already is: the only useful meaning is a copy beside it.
      op = "copy";
      name = freeName(name, new Set([...existing, ...planned]));
    } else if (planned.has(name)) {
      name = freeName(name, new Set([...existing, ...planned]));
    } else if (existing.has(name)) {
      plan.clashes.push(name);
      if (req.clash === "skip") {
        plan.skipped.push(from);
        continue;
      }
      if (req.clash === "keep-both") name = freeName(name, new Set([...existing, ...planned]));
      else overwrite = true;
    }
    const to = joinPath(req.targetDir, name);
    if (overwrite && from.startsWith(`${to}/`)) {
      return {
        steps: [],
        skipped: [],
        clashes: [],
        invalid: "A folder can't be replaced by something inside it.",
      };
    }
    planned.add(name);
    plan.steps.push({ op, from, to, overwrite });
  }
  return plan;
}

export function freeName(name: string, taken: Set<string>): string {
  const ext = extname(name);
  const stem = ext ? name.slice(0, -ext.length) : name;
  for (let i = 1; ; i++) {
    const candidate = `${stem} copy${i === 1 ? "" : ` ${i}`}${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export function validateName(name: string): string | undefined {
  if (!name.trim()) return "Enter a name.";
  if (/[/\\]/.test(name)) return "A name can't contain / or \\.";
  if (name === "." || name === "..") return "This name is reserved.";
  return undefined;
}
