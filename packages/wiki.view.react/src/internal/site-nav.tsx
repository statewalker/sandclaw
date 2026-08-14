import { ScrollArea } from "@statewalker/ui.view.shadcn";
import type { SitePage } from "@statewalker/wiki.core";
import type { ReactElement } from "react";

interface SiteNavProps {
  pages: SitePage[];
  selected: number;
  onSelect: (index: number) => void;
}

/** Left-rail table of contents: the site's pages in manifest order, single-select. */
export function SiteNav({ pages, selected, onSelect }: SiteNavProps): ReactElement {
  return (
    <ScrollArea className="h-full w-56 shrink-0 border-r">
      <nav className="flex flex-col gap-0.5 p-2">
        {pages.map((page, i) => (
          <button
            key={page.id}
            type="button"
            onClick={() => onSelect(i)}
            aria-current={i === selected ? "page" : undefined}
            className={`rounded px-2 py-1 text-left text-sm ${
              i === selected ? "bg-accent font-medium" : "hover:bg-accent/50"
            }`}
          >
            {page.title}
          </button>
        ))}
      </nav>
    </ScrollArea>
  );
}
