import { createRoute } from "honox/factory";
import {
  FileText,
  Library,
  MessageSquareText,
  Search,
  Tag,
} from "lucide-react";
import { listAnswers, listProjects, listReports } from "@/lib/reports";
import { listTopics } from "@/lib/wiki";

export default createRoute(async (c) => {
  const projects = await listProjects();
  const cards = await Promise.all(
    projects.map(async (project) => ({
      project,
      reports: (await listReports(project)).length,
      topics: (await listTopics(project)).length,
      answers: (await listAnswers(project)).length,
    })),
  );

  return c.render(
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Wikis</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a wiki to browse its reports, review saved answers, or search it
          live.
        </p>
      </header>

      {cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No wikis found under the data root. Set <code>REPORT_DATA_ROOT</code>{" "}
          to a directory of scanned projects, each with a <code>.project/</code>.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {cards.map((card) => {
            const p = encodeURIComponent(card.project);
            return (
              <li key={card.project} className="rounded-xl border p-4">
                <a
                  href={`/projects/${p}`}
                  className="flex items-center gap-2 text-base font-medium hover:underline"
                >
                  <Library className="size-4 shrink-0 text-muted-foreground" />
                  {card.project}
                </a>
                <div className="mt-3 flex flex-wrap gap-1.5 text-sm">
                  <a
                    href={`/projects/${p}/reports`}
                    className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 transition-colors hover:bg-accent"
                  >
                    <FileText className="size-3.5" /> Reports
                    <span className="text-muted-foreground">
                      {card.reports}
                    </span>
                  </a>
                  <a
                    href={`/projects/${p}/topics`}
                    className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 transition-colors hover:bg-accent"
                  >
                    <Tag className="size-3.5" /> Topics
                    <span className="text-muted-foreground">{card.topics}</span>
                  </a>
                  <a
                    href={`/projects/${p}/answers`}
                    className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 transition-colors hover:bg-accent"
                  >
                    <MessageSquareText className="size-3.5" /> Answers
                    <span className="text-muted-foreground">
                      {card.answers}
                    </span>
                  </a>
                  <a
                    href={`/projects/${p}/search`}
                    className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 transition-colors hover:bg-accent"
                  >
                    <Search className="size-3.5" /> Search
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>,
    { title: "Wikis" },
  );
});
