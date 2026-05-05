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
        // CSS grid is more predictable than flex for "title takes the
        // remaining width, icons keep their natural width" — the
        // `minmax(0,1fr)` column lets the title shrink past its
        // content, and the two `auto` columns fix the icon buttons at
        // their intrinsic 28×28. With flex + min-w-0 + shrink-0 the
        // browser was still squeezing the trash icon off the right
        // edge on a narrow sidebar; grid removes the ambiguity.
        "group grid items-center gap-1 rounded-md px-2 py-1.5 text-sm",
        editing ? "grid-cols-1" : "grid-cols-[minmax(0,1fr)_auto_auto]",
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
          // `min-w-0` is still necessary inside the 1fr grid column
          // so that the title element can shrink past its intrinsic
          // content width.
          className="flex min-w-0 flex-col items-start text-left"
        >
          <span className="block w-full overflow-hidden text-ellipsis whitespace-nowrap font-medium">
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
            // `shrink-0` keeps the icon at its fixed 28×28 even when
            // the row is narrower than the title would naturally want
            // — pairs with `min-w-0` on the title button above. The
            // selected row always shows the icons (rename/delete is
            // most often used on the active session, and on a narrow
            // sidebar without hover support — touch devices, sidebar
            // resized very small — they'd otherwise be unreachable).
            className={cn(
              "h-7 w-7 shrink-0",
              selected
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
            )}
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
                className={cn(
                  "h-7 w-7 shrink-0",
                  selected
                    ? "opacity-100"
                    : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                )}
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
