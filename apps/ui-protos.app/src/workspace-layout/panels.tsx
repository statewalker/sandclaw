// Static stand-ins for the plugin panels. They only need to look like the real
// thing so the layout can be judged; none of them does any work.
import { ScrollArea } from "@statewalker/ui.view.shadcn";
import { CircleCheck, Loader2 } from "lucide-react";
import { ZoneTitle } from "../zone-title.js";

export function DocumentPanel() {
  return (
    <ScrollArea className="h-full">
      {/* Sized by its panel, not the screen: a container query (@md) widens the margins. */}
      <article className="mx-auto max-w-2xl px-4 py-6 text-sm leading-6 @md:px-8 @md:py-10">
        <h1 className="mb-1 text-lg font-semibold @md:text-xl">Offer — Dupont & Fils</h1>
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
    <div className="overflow-x-auto p-2 @md:p-4">
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
        <Loader2 className="size-3.5 animate-spin" /> Q3 spending summary · 2 of 4
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
