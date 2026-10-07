// Static stand-ins for the plugin panels. They only need to look like the real
// thing so the layout can be judged; none of them does any work.
import { ScrollArea } from "@statewalker/ui.view.shadcn";
import {
  ChevronDown,
  ChevronRight,
  CircleCheck,
  FileSpreadsheet,
  FileText,
  Folder,
  Loader2,
  Presentation,
  Square,
  SquareCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { type FolderEntry, folder, todos } from "../mock.js";

function ZoneTitle({ children }: { children: ReactNode }) {
  return (
    <div className="text-muted-foreground px-3 pt-3 pb-1 text-xs font-medium tracking-wide uppercase">
      {children}
    </div>
  );
}

function FileIcon({ name }: { name: string }) {
  if (name.endsWith(".xlsx")) return <FileSpreadsheet className="size-4" />;
  if (name.endsWith(".pptx")) return <Presentation className="size-4" />;
  return <FileText className="text-muted-foreground size-4" />;
}

function Entry({ entry, depth }: { entry: FolderEntry; depth: number }) {
  const isFolder = entry.children !== undefined || !entry.name.includes(".");
  return (
    <>
      <div
        className="hover:bg-accent flex h-8 items-center gap-1.5 rounded-md pr-2 text-sm"
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        {isFolder ? (
          entry.children ? (
            <ChevronDown className="text-muted-foreground size-3.5" />
          ) : (
            <ChevronRight className="text-muted-foreground size-3.5" />
          )
        ) : (
          <span className="w-3.5" />
        )}
        {isFolder ? (
          <Folder className="text-muted-foreground size-4" />
        ) : (
          <FileIcon name={entry.name} />
        )}
        <span className="truncate">{entry.name}</span>
      </div>
      {entry.children?.map((child) => (
        <Entry key={child.name} entry={child} depth={depth + 1} />
      ))}
    </>
  );
}

export function FolderPanel() {
  return (
    <ScrollArea className="h-full">
      <ZoneTitle>Folder</ZoneTitle>
      <div className="px-1 pb-3">
        {folder.map((entry) => (
          <Entry key={entry.name} entry={entry} depth={0} />
        ))}
      </div>
    </ScrollArea>
  );
}

export function TodosPanel() {
  return (
    <ScrollArea className="h-full">
      <ZoneTitle>Todos</ZoneTitle>
      <ul className="grid gap-1 px-3 pb-3">
        {todos.map((t) => (
          <li key={t.text} className="flex items-start gap-2 text-sm">
            {t.done ? (
              <SquareCheck className="text-muted-foreground mt-0.5 size-4 shrink-0" />
            ) : (
              <Square className="mt-0.5 size-4 shrink-0" />
            )}
            <span className={t.done ? "text-muted-foreground line-through" : ""}>{t.text}</span>
          </li>
        ))}
      </ul>
    </ScrollArea>
  );
}

export function DocumentPanel() {
  return (
    <ScrollArea className="h-full">
      <article className="mx-auto max-w-2xl px-8 py-10 text-sm leading-6">
        <h1 className="mb-1 text-xl font-semibold">Offer — Dupont & Fils</h1>
        <p className="text-muted-foreground mb-6 text-xs">Clients / Dupont — offer.docx</p>
        <p className="mb-4">
          Following our meeting of 2 October, we propose to renovate the ground floor of the
          workshop in two phases, keeping the shop open during the works.
        </p>
        <h2 className="mt-6 mb-2 font-semibold">Phase 1 — structure</h2>
        <p className="mb-4">
          Load-bearing wall opening, new beam, electrical rewiring of the front room. Six weeks,
          starting mid-November.
        </p>
        <h2 className="mt-6 mb-2 font-semibold">Phase 2 — finishes</h2>
        <p>Flooring, lighting, display cabinets. Four weeks, after the January sales.</p>
      </article>
    </ScrollArea>
  );
}

export function SpreadsheetPanel() {
  const rows = [
    ["Supplier", "Sep", "Oct", "Nov"],
    ["Bois Lyonnais", "4 120", "3 980", "4 450"],
    ["EDF", "612", "640", "702"],
    ["Insurance", "280", "280", "280"],
  ];
  return (
    <div className="p-4">
      <table className="w-full border-collapse text-sm">
        <tbody>
          {rows.map((row, i) => (
            <tr key={row[0]} className={i === 0 ? "bg-muted font-medium" : ""}>
              {row.map((cell) => (
                <td key={cell} className="border px-2 py-1.5">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TasksPanel() {
  return (
    <div className="flex h-full items-center gap-6 px-3 text-sm">
      <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        Tasks
      </span>
      <span className="flex items-center gap-1.5">
        <Loader2 className="size-3.5 animate-spin" /> Clients deck · 2 of 4
      </span>
      <span className="flex items-center gap-1.5">
        <CircleCheck className="size-3.5" /> Contacts → Outputs/contacts.xlsx
      </span>
    </div>
  );
}

/** Contributed with no target zone: it appears only when the user opens it. */
export function OutlinePanel() {
  return (
    <ScrollArea className="h-full">
      <ZoneTitle>Outline</ZoneTitle>
      <ul className="grid gap-1 px-3 pb-3 text-sm">
        <li>Offer — Dupont & Fils</li>
        <li className="text-muted-foreground pl-3">Phase 1 — structure</li>
        <li className="text-muted-foreground pl-3">Phase 2 — finishes</li>
      </ul>
    </ScrollArea>
  );
}

/** Stands in for a panel whose plugin is gone, for the instant before it is removed. */
export function MissingPanel() {
  return null;
}
