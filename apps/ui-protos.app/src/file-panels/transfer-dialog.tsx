import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@statewalker/ui.view.shadcn";
import type { FilesApi } from "@statewalker/webrun-files";
import { basename, dirname } from "@statewalker/webrun-files";
import { type FormEvent, useEffect, useId, useState } from "react";
import { MountUnavailable, type Problem } from "./problem.js";
import {
  type ClashPolicy,
  findClashes,
  planTransfer,
  type TransferOp,
  type TransferRequest,
  validateName,
} from "./transfer-plan.js";

export interface TransferTarget {
  label: string;
  path: string;
}

export interface TransferDialogProps {
  op: TransferOp;
  sources: string[];
  /** The other panels' folders, the preferred one first. */
  targets: TransferTarget[];
  files: FilesApi;
  /** Dropped from the desktop: there is nothing to move. */
  external?: boolean;
  /** Another transfer is still running: this one can't start yet. */
  busy?: boolean;
  onConfirm(request: TransferRequest): void;
  onCancel(): void;
  /** Unlock (or reach) a storage the dialog found unavailable. */
  onProblemAction?(problem: Problem): void;
}

const CLASH_CHOICES: { value: ClashPolicy; label: string }[] = [
  { value: "overwrite", label: "Overwrite" },
  { value: "keep-both", label: "Keep both" },
  { value: "skip", label: "Skip" },
];

interface Check {
  /** The checked request this result belongs to. */
  key?: string;
  /** One source: its name is taken in the target folder. */
  exists: boolean;
  /** Several sources: the names taken in the target folder. */
  clashes: string[];
  invalid?: string;
  /** The target (or a source) is on a storage that can't be used now. */
  problem?: Problem;
}

/** Copy or move: the operation, the target folder, the name (one item) or the clash choice (several). */
export function TransferDialog(props: TransferDialogProps) {
  const { sources, targets, files, external } = props;
  const one = sources.length === 1;
  const first = sources[0] ?? "";
  const [op, setOp] = useState<TransferOp>(external ? "copy" : props.op);
  const [folder, setFolder] = useState(targets[0]?.path ?? "");
  const [name, setName] = useState(basename(first));
  const [clash, setClash] = useState<ClashPolicy>("keep-both");
  const [check, setCheck] = useState<Check>({ exists: false, clashes: [] });
  const [retries, setRetries] = useState(0);
  const id = useId();

  const nameError = one ? validateName(name) : undefined;
  const base = {
    op,
    sources,
    targetDir: folder.trim(),
    rename: one && name !== basename(first) ? name : undefined,
  };
  // The clash choice is left out: picking one must not re-check (and so
  // re-render) the choices themselves. The check plans with "keep both"; a
  // plan only an overwrite makes invalid is refused by the run, in the summary.
  const checked: TransferRequest = { ...base, clash: one ? "overwrite" : "keep-both" };
  const key = JSON.stringify(checked);
  // One item replaces only what the dialog warned about: a name taken after
  // the check (or before it finished) is skipped, never silently replaced.
  const replaceWarned = check.key === key && check.exists;
  const request: TransferRequest = {
    ...base,
    clash: one ? (replaceWarned ? "overwrite" : "skip") : clash,
  };

  // What the request would do, checked again on every change. The previous
  // result stays until the new one arrives, so nothing blinks while typing; a
  // folder that cannot be read here fails in the run, with its reason in the summary.
  // `key` stands for `checked` in the dependencies.
  useEffect(() => {
    let current = true;
    if (nameError || !checked.targetDir) return;
    (async () => {
      let next: Check = { key, exists: false, clashes: [] };
      try {
        const [plan, clashes] = await Promise.all([
          planTransfer(files, checked),
          one ? [] : findClashes(files, sources, checked.targetDir),
        ]);
        next = { key, exists: plan.clashes.length > 0, clashes, invalid: plan.invalid };
      } catch (e) {
        // A locked or unreachable storage is said here, before anything starts;
        // any other error is reported by the run.
        if (e instanceof MountUnavailable) next = { ...next, problem: e.problem };
      }
      if (current) setCheck(next);
    })();
    return () => {
      current = false;
    };
  }, [files, key, nameError, retries]);

  const sameFolder =
    sources.some((s) => dirname(s) === request.targetDir) && (!one || name === basename(first));
  const verb = op === "copy" ? "Copy" : "Move";
  const disabled = Boolean(
    props.busy || nameError || check.invalid || check.problem || !request.targetDir,
  );
  const problem = check.problem;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!disabled) props.onConfirm(request);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && props.onCancel()}>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {verb} {one ? basename(first) : `${sources.length} items`}
          </DialogTitle>
          <DialogDescription>
            {external ? "From your computer into a storage." : "Choose where they go."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid min-w-0 gap-4 text-sm">
          <fieldset className="flex gap-4">
            <legend className="sr-only">Operation</legend>
            {(external ? (["copy"] as const) : (["copy", "move"] as const)).map((o) => (
              <label key={o} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`${id}-op`}
                  checked={op === o}
                  onChange={() => setOp(o)}
                />
                {o === "copy" ? "Copy" : "Move"}
              </label>
            ))}
          </fieldset>

          {targets.length > 1 ? (
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-target`}>To the panel</Label>
              <select
                id={`${id}-target`}
                value={targets.some((t) => t.path === folder) ? folder : ""}
                onChange={(e) => setFolder(e.target.value)}
                className="h-9 min-w-0 rounded-md border bg-background px-2"
              >
                {targets.some((t) => t.path === folder) ? null : <option value="">—</option>}
                {targets.map((t) => (
                  <option key={t.path} value={t.path}>
                    {t.label} ({t.path})
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-folder`}>Folder</Label>
            <Input
              id={`${id}-folder`}
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              spellCheck={false}
            />
            {sameFolder ? (
              <p className="text-muted-foreground">Same folder: a copy is made beside it.</p>
            ) : null}
            {problem ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 text-destructive">{problem.message}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (problem.cause === "locked") props.onProblemAction?.(problem);
                    setRetries((n) => n + 1);
                  }}
                >
                  {problem.cause === "locked" ? "Unlock" : "Retry"}
                </Button>
              </div>
            ) : null}
          </div>

          {one ? (
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-name`}>Name</Label>
              <Input
                id={`${id}-name`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                spellCheck={false}
              />
              {nameError ? (
                <p className="text-destructive">{nameError}</p>
              ) : check.exists ? (
                <p className="text-amber-700 dark:text-amber-400">
                  {name} already exists — it will be replaced.
                </p>
              ) : null}
            </div>
          ) : check.clashes.length ? (
            <fieldset className="grid gap-2">
              <legend className="mb-1">
                {check.clashes.length === 1
                  ? `${check.clashes[0]} already exists there.`
                  : `${check.clashes.length} items already exist there.`}
              </legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {CLASH_CHOICES.map((c) => (
                  <label key={c.value} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`${id}-clash`}
                      checked={clash === c.value}
                      onChange={() => setClash(c.value)}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          {check.invalid ? <p className="text-destructive">{check.invalid}</p> : null}
          {props.busy ? (
            <p className="text-muted-foreground">Wait for the current transfer to finish.</p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={props.onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={disabled}>
              {verb}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
