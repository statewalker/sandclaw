import { createRoute } from "honox/factory";
import { FileText, Library, MessageSquareText, Search } from "lucide-react";
import { ANSWERS_SET, listProjects, listReportSets } from "@/lib/reports";

export default createRoute(async (c) => {
  const [projects, sets] = await Promise.all([
    listProjects(),
    listReportSets(),
  ]);

  return c.render(
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Wiki Viewer</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse generated reports, search each wiki live, and trace every claim
          back to its source document.
        </p>
      </header>

      {projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No wikis found under the data root. Set <code>REPORT_DATA_ROOT</code>{" "}
          to a directory of projects, each with a <code>.wikiindex/</code>.
        </p>
      ) : (
        <div className="space-y-8">
          {projects.map((project) => {
            const projectSets = sets.filter((s) => s.project === project);
            return (
              <section key={project}>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                    <Library className="size-4" /> {project}
                  </h2>
                  <a
                    href={`/q/${encodeURIComponent(project)}`}
                    className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm transition-colors hover:bg-accent"
                  >
                    <Search className="size-3.5" /> Search
                  </a>
                </div>
                <ul className="grid gap-3">
                  {projectSets.length === 0 && (
                    <li className="text-sm text-muted-foreground">
                      No reports yet — use Search to ask a question.
                    </li>
                  )}
                  {projectSets.map((s) => {
                    const answers = s.name === ANSWERS_SET;
                    return (
                      <li key={`${s.project}/${s.name}`}>
                        <a
                          href={`/r/${encodeURIComponent(s.project)}/${encodeURIComponent(s.name)}`}
                          className="block rounded-xl border p-4 transition-colors hover:border-foreground/30"
                        >
                          <div className="flex items-center gap-2 text-base font-medium">
                            {answers ? (
                              <MessageSquareText className="size-4 shrink-0 text-muted-foreground" />
                            ) : (
                              <FileText className="size-4 shrink-0 text-muted-foreground" />
                            )}
                            {answers ? "Saved answers" : s.name}
                          </div>
                          <span className="mt-2 inline-block rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                            {s.sectionCount} {answers ? "answers" : "sections"}
                          </span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </main>,
    { title: "Wiki Viewer" },
  );
});
