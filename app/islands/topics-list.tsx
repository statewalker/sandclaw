import { Search, Tag } from "lucide-react";
import { useState } from "react";
import type { TopicSummary } from "@/lib/wiki";

/**
 * Browse + text-filter the project's topics. Filtering is client-side: a topic
 * shows when every whitespace-separated word in the input appears in its name or
 * description (case-insensitive). Empty filter shows all. Each topic links into
 * the search workspace with that topic opened in the context panel.
 */
export default function TopicsList({
  project,
  topics,
}: {
  project: string;
  topics: TopicSummary[];
}) {
  const [filter, setFilter] = useState("");
  const terms = filter.toLowerCase().split(/\s+/).filter(Boolean);
  const shown =
    terms.length === 0
      ? topics
      : topics.filter((t) => {
          const hay = `${t.name} ${t.description}`.toLowerCase();
          return terms.every((w) => hay.includes(w));
        });
  const p = encodeURIComponent(project);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-8">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Topics</h1>
        <span className="text-sm text-muted-foreground">
          {shown.length} of {topics.length}
        </span>
      </div>

      <div className="relative mb-6">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter topics…"
          className="w-full rounded-md border bg-background py-2 pr-3 pl-9 text-sm outline-none focus:ring-2 focus:ring-ring"
          aria-label="Filter topics"
        />
      </div>

      {topics.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No topics indexed for this wiki.
        </p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No topics match “{filter}”.
        </p>
      ) : (
        <ul className="grid gap-2">
          {shown.map((t) => (
            <li key={t.key}>
              <a
                href={`/projects/${p}/search?topic=${encodeURIComponent(t.key)}`}
                className="block rounded-lg border p-3 transition-colors hover:border-foreground/30"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Tag className="size-3.5 shrink-0 text-muted-foreground" />
                    {t.name}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {t.referenceCount} refs
                  </span>
                </div>
                {t.description && (
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {t.description}
                  </p>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
