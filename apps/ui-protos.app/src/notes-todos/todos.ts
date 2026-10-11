// Todos are not stored anywhere of their own: they are the Markdown checklist
// items (`- [ ] …`) in the user's files. These functions read and tick them.

export interface Todo {
  path: string;
  /** Line index in the file. */
  line: number;
  text: string;
  done: boolean;
}

const item = /^\s*[-*] \[( |x|X)\] (.*)$/;

/** Every checklist item in `files` (path → Markdown text), in file order. */
export function collectTodos(files: Record<string, string>): Todo[] {
  return Object.entries(files).flatMap(([path, text]) =>
    text.split("\n").flatMap((content, line) => {
      const m = item.exec(content);
      return m ? [{ path, line, text: m[2] ?? "", done: m[1] !== " " }] : [];
    }),
  );
}

/** The file's text with the item on `line` ticked or unticked. */
export function setDone(text: string, line: number, done: boolean): string {
  return text
    .split("\n")
    .map((content, i) =>
      i === line ? content.replace(/\[( |x|X)\]/, done ? "[x]" : "[ ]") : content,
    )
    .join("\n");
}

/** The file's text with a new open item appended. */
export function addTodo(text: string, todo: string): string {
  const base = text === "" || text.endsWith("\n") ? text : `${text}\n`;
  return `${base}- [ ] ${todo}\n`;
}
