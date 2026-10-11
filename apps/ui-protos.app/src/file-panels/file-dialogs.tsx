import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
import { validateName } from "./transfer-plan.js";

interface NameDialogProps {
  files: FilesApi;
  /** The folder the name must be free in. */
  dir: string;
  onConfirm(name: string): void;
  onCancel(): void;
}

/** A name for something in `dir`: valid, and not taken by anything else there. */
function NameDialog({
  title,
  description,
  action,
  initial,
  files,
  dir,
  onConfirm,
  onCancel,
}: NameDialogProps & { title: string; description: string; action: string; initial: string }) {
  const [name, setName] = useState(initial);
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const id = useId();

  useEffect(() => {
    let current = true;
    (async () => {
      const names = new Set<string>();
      try {
        for await (const e of files.list(dir)) names.add(e.name);
      } catch {
        /* an unreadable folder: the operation itself reports it */
      }
      if (current) setTaken(names);
    })();
    return () => {
      current = false;
    };
  }, [files, dir]);

  const error =
    validateName(name) ??
    (name !== initial && taken.has(name) ? `${name} already exists here.` : undefined);
  const disabled = Boolean(error) || name === initial;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!disabled) onConfirm(name);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid min-w-0 gap-4 text-sm">
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-name`}>Name</Label>
            <Input
              id={`${id}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              spellCheck={false}
              autoFocus
            />
            {error && name !== "" ? <p className="text-destructive">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={disabled}>
              {action}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NewFolderDialog(props: NameDialogProps) {
  return (
    <NameDialog
      {...props}
      title="New folder"
      description={`In ${props.dir}`}
      action="Create"
      initial=""
    />
  );
}

export function RenameDialog({ path, ...props }: Omit<NameDialogProps, "dir"> & { path: string }) {
  return (
    <NameDialog
      {...props}
      dir={dirname(path)}
      title={`Rename ${basename(path)}`}
      description={`In ${dirname(path)}`}
      action="Rename"
      initial={basename(path)}
    />
  );
}

export function DeleteDialog({
  paths,
  onConfirm,
  onCancel,
}: {
  paths: string[];
  onConfirm(): void;
  onCancel(): void;
}) {
  const what = paths.length === 1 ? basename(paths[0] ?? "") : `${paths.length} items`;
  return (
    <AlertDialog open onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="break-all">Delete {what}?</AlertDialogTitle>
          <AlertDialogDescription>
            Local folders and S3 have no trash: this can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={onConfirm}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
