import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface SessionRowProps {
  id: string;
  title: string;
  updatedAt: string | undefined;
  selected: boolean;
  onOpen: (id: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function formatRelative(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return date.toLocaleDateString();
}

export function SessionRow({
  id,
  title,
  updatedAt,
  selected,
  onOpen,
  onRename,
  onDelete,
}: SessionRowProps): React.ReactElement {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);

  const commit = async (): Promise<void> => {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== title) {
      await onRename(id, next);
    } else {
      setDraft(title);
    }
  };

  const cancel = (): void => {
    setDraft(title);
    setEditing(false);
  };

  return (
    <div
      className={cn(
        "group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm",
        selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
      )}
    >
      {editing ? (
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commit();
            if (e.key === "Escape") cancel();
          }}
          onBlur={() => void commit()}
          className="h-7 text-sm"
        />
      ) : (
        <button
          type="button"
          onClick={() => onOpen(id)}
          onDoubleClick={() => setEditing(true)}
          className="flex flex-1 flex-col items-start truncate text-left"
        >
          <span className="w-full truncate font-medium">
            {title || "Untitled"}
          </span>
          {updatedAt ? (
            <span className="text-xs text-muted-foreground">
              {formatRelative(updatedAt)}
            </span>
          ) : null}
        </button>
      )}
      {!editing ? (
        <>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 opacity-0 group-hover:opacity-100"
            onClick={() => setEditing(true)}
            aria-label="Rename"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 opacity-0 group-hover:opacity-100"
                aria-label="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this session?</AlertDialogTitle>
                <AlertDialogDescription>
                  "{title || "Untitled"}" and its messages will be removed from
                  the workspace folder. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void onDelete(id)}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : null}
    </div>
  );
}
