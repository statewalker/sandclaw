import { Button, cn, Input, ScrollArea } from "@statewalker/ui.view.shadcn";
import { FilePlus, Square, SquareCheck } from "lucide-react";
import { useState } from "react";
import { listFiles } from "../folder-zone/tree.js";
import { folder } from "../mock.js";
import { ZoneTitle } from "../zone-title.js";
import { addTodo, collectTodos, setDone, type Todo } from "./todos.js";

/**
 * - `by-file`: todos grouped under the file they live in;
 * - `one-list`: one list, each item labelled with its file.
 */
export type TodoGrouping = "by-file" | "one-list";

const INBOX = "Notes/todo.md";

/** The Markdown files of the mock folder, path → text. */
function initialFiles(): Record<string, string> {
  return Object.fromEntries(
    listFiles(folder).flatMap((f) => (f.entry.text === undefined ? [] : [[f.path, f.entry.text]])),
  );
}

function fileName(path: string) {
  return path.split("/").at(-1)?.replace(/\.md$/, "") ?? path;
}

export function TodosView({ grouping = "by-file" }: { grouping?: TodoGrouping }) {
  const [files, setFiles] = useState(initialFiles);
  const [draft, setDraft] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [notice, setNotice] = useState("");
  const todos = collectTodos(files);
  const open = todos.filter((t) => !t.done);
  const done = todos.filter((t) => t.done);

  const tick = (t: Todo) =>
    setFiles({ ...files, [t.path]: setDone(files[t.path] ?? "", t.line, !t.done) });

  const add = () => {
    if (!draft.trim()) return;
    setFiles({ ...files, [INBOX]: addTodo(files[INBOX] ?? "", draft.trim()) });
    setDraft("");
  };

  const row = (t: Todo, label: boolean) => (
    <li key={`${t.path}:${t.line}`}>
      <button
        type="button"
        onClick={() => tick(t)}
        className="hover:bg-accent flex w-full items-start gap-2 rounded-md px-2 py-1 text-left text-sm"
      >
        {t.done ? (
          <SquareCheck className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        ) : (
          <Square className="mt-0.5 size-4 shrink-0" />
        )}
        <span className={cn("flex-1", t.done && "text-muted-foreground line-through")}>
          {t.text}
          {label && (
            <span className="text-muted-foreground ml-1.5 text-xs">· {fileName(t.path)}</span>
          )}
        </span>
      </button>
    </li>
  );

  const groups = [...new Set(open.map((t) => t.path))];
  return (
    <div className="flex h-full flex-col">
      <ZoneTitle
        action={
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setNotice("Created Notes/note 2026-10-07.md")}
          >
            <FilePlus /> New note
          </Button>
        }
      >
        Todos
      </ZoneTitle>
      {notice && <p className="text-muted-foreground px-3 pb-1 text-xs">{notice}</p>}
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-2 px-1 pb-3">
          {grouping === "by-file" ? (
            groups.map((path) => (
              <div key={path}>
                <div className="text-muted-foreground px-2 pt-1 text-xs" title={path}>
                  {fileName(path)}
                </div>
                <ul>{open.filter((t) => t.path === path).map((t) => row(t, false))}</ul>
              </div>
            ))
          ) : (
            <ul>{open.map((t) => row(t, true))}</ul>
          )}
          {done.length > 0 && (
            <div>
              <button
                type="button"
                className="text-muted-foreground px-2 text-xs hover:underline"
                onClick={() => setShowDone(!showDone)}
              >
                {showDone ? "Hide" : "Show"} {done.length} done
              </button>
              {showDone && <ul>{done.map((t) => row(t, true))}</ul>}
            </div>
          )}
        </div>
      </ScrollArea>
      <form
        className="border-t p-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a todo"
          title="New todos go to Notes/todo.md"
          aria-label="Add a todo"
          className="h-8 text-sm"
        />
      </form>
    </div>
  );
}
