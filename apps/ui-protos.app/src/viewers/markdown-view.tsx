import { cn } from "@statewalker/ui.view.shadcn";
import { type ReactNode, useEffect, useRef } from "react";
import { type Block, type Inline, parseInline, parseMarkdown } from "./markdown.js";

export interface BlockHandlers {
  /** A todo item's checkbox was clicked: tick (`done`) or untick the item on `line`. */
  onToggle?: (line: number, done: boolean) => void;
  /** The block starting at `line` was clicked (not on a checkbox or link). */
  onBlockClick?: (block: Block) => void;
}

function InlineView({ nodes }: { nodes: Inline[] }) {
  return nodes.map((n, i) => {
    const key = `${i}`;
    if (typeof n === "string") return n;
    switch (n.kind) {
      case "strong":
        return (
          <strong key={key}>
            <InlineView nodes={n.children} />
          </strong>
        );
      case "em":
        return (
          <em key={key}>
            <InlineView nodes={n.children} />
          </em>
        );
      case "code":
        return (
          <code key={key} className="bg-muted rounded px-1 font-mono text-[0.9em]">
            {n.text}
          </code>
        );
      default:
        return (
          <a
            key={key}
            href={n.href}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-primary underline underline-offset-2"
          >
            <InlineView nodes={n.children} />
          </a>
        );
    }
  });
}

const text = (s: string) => <InlineView nodes={parseInline(s)} />;

const headingClass = [
  "",
  "text-2xl font-semibold",
  "text-xl font-semibold",
  "text-lg font-semibold",
  "font-semibold",
  "font-semibold",
  "font-semibold",
];

function BlockBody({ block, onToggle }: { block: Block; onToggle?: BlockHandlers["onToggle"] }) {
  switch (block.kind) {
    case "heading":
      return <div className={cn("mt-2", headingClass[block.level])}>{text(block.text)}</div>;
    case "paragraph":
      return <p className="leading-relaxed">{text(block.text)}</p>;
    case "rule":
      return <hr className="my-2" />;
    case "code":
      return (
        <pre className="bg-muted overflow-x-auto rounded-md p-3 font-mono text-xs">
          {block.text}
        </pre>
      );
    case "table":
      return (
        <div className="overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr>
                {block.head.map((h, i) => (
                  <th key={`${i}:${h}`} className="border px-2 py-1 text-left font-medium">
                    {text(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={`${block.line + 2 + r}`}>
                  {row.map((c, i) => (
                    <td key={`${i}:${c}`} className="border px-2 py-1">
                      {text(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "list": {
      const List = block.ordered ? "ol" : "ul";
      const todos = block.items.some((it) => it.done !== undefined);
      return (
        <List
          className={cn(
            "flex flex-col gap-1",
            !todos && (block.ordered ? "list-decimal pl-6" : "list-disc pl-6"),
          )}
        >
          {block.items.map((it) =>
            it.done === undefined ? (
              <li key={it.line}>{text(it.text)}</li>
            ) : (
              <li key={it.line} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  aria-label={it.text}
                  checked={it.done}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => onToggle?.(it.line, !it.done)}
                  className="accent-primary mt-1 size-4 shrink-0"
                />
                <span className={cn(it.done && "text-muted-foreground line-through")}>
                  {text(it.text)}
                </span>
              </li>
            ),
          )}
        </List>
      );
    }
  }
}

/** One block, clickable when `onBlockClick` is given; `cited` marks and scrolls to it. */
export function MarkdownBlock({
  block,
  cited,
  onToggle,
  onBlockClick,
}: { block: Block; cited?: boolean } & BlockHandlers) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (cited) ref.current?.scrollIntoView?.({ block: "center" });
  }, [cited]);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a pointer shortcut; the mode toggle is the keyboard path.
    // biome-ignore lint/a11y/useKeyWithClickEvents: as above.
    <div
      ref={ref}
      data-line={block.line}
      data-cited={cited || undefined}
      onClick={onBlockClick && (() => onBlockClick(block))}
      className={cn(
        "-mx-2 rounded-md px-2 py-1",
        onBlockClick && "hover:bg-muted/60 cursor-text",
        cited && "bg-yellow-200/80 dark:bg-yellow-500/30",
      )}
    >
      <BlockBody block={block} onToggle={onToggle} />
    </div>
  );
}

/** A note rendered: the preview. `citedLine` highlights the block holding that line. */
export function MarkdownView({
  source,
  citedLine,
  footer,
  ...handlers
}: { source: string; citedLine?: number; footer?: ReactNode } & BlockHandlers) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      {parseMarkdown(source).map((b) => (
        <MarkdownBlock
          key={b.line}
          block={b}
          cited={citedLine !== undefined && citedLine >= b.line && citedLine < b.end}
          {...handlers}
        />
      ))}
      {footer}
    </div>
  );
}
