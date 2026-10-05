import { ScrollArea } from "@/components/ui/scroll-area";
import type { Section } from "@/lib/types";
import { cn } from "@/lib/utils";

export function SectionNav({
  sections,
  selectedId,
  onSelect,
}: {
  sections: Section[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <ScrollArea className="h-full">
      <nav className="p-2">
        <ul className="space-y-0.5">
          {sections.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onSelect(s.id)}
                className={cn(
                  "w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors",
                  s.id === selectedId
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                {s.title}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </ScrollArea>
  );
}
