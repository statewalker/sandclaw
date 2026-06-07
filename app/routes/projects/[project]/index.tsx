import { createRoute } from "honox/factory";
import { FileText, MessageSquareText, Search, Tag } from "lucide-react";
import { ProjectNav } from "@/components/project-nav";
import { listAnswers, listProjects, listReports } from "@/lib/reports";
import { listTopics } from "@/lib/wiki";

export default createRoute(async (c) => {
  const project = decodeURIComponent(c.req.param("project") ?? "");
  if (!(await listProjects()).includes(project)) return c.notFound();

  const [reports, answers, topics] = await Promise.all([
    listReports(project),
    listAnswers(project),
    listTopics(project),
  ]);
  const p = encodeURIComponent(project);

  return c.render(
    <div className="flex min-h-screen flex-col">
      <ProjectNav project={project} section="home" />
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <form
          action={`/projects/${p}/search`}
          method="get"
          className="mb-10 flex gap-2"
        >
          <input
            type="text"
            name="q"
            placeholder={`Ask the ${project} wiki…`}
            className="flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            aria-label="Question"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Search className="size-4" /> Search
          </button>
        </form>

        <a
          href={`/projects/${p}/topics`}
          className="mb-10 flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors hover:border-foreground/30"
        >
          <span className="flex items-center gap-1.5 font-medium">
            <Tag className="size-4 text-muted-foreground" /> Browse topics
          </span>
          <span className="text-xs text-muted-foreground">
            {topics.length} topics →
          </span>
        </a>

        <section className="mb-10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <FileText className="size-4" /> Reports
            </h2>
            <a
              href={`/projects/${p}/reports`}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              All reports →
            </a>
          </div>
          {reports.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No reports in this wiki.
            </p>
          ) : (
            <ul className="grid gap-2">
              {reports.map((r) => (
                <li key={r.id}>
                  <a
                    href={`/projects/${p}/reports/${encodeURIComponent(r.id)}`}
                    className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors hover:border-foreground/30"
                  >
                    <span className="font-medium">{r.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {r.sectionCount} sections
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <MessageSquareText className="size-4" /> Saved answers
            </h2>
            <a
              href={`/projects/${p}/answers`}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              All answers →
            </a>
          </div>
          {answers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No saved answers yet — run a search and save the result.
            </p>
          ) : (
            <ul className="grid gap-2">
              {answers.map((a) => (
                <li key={a.id}>
                  <a
                    href={`/projects/${p}/answers/${encodeURIComponent(a.id)}`}
                    className="block rounded-lg border px-3 py-2 text-sm transition-colors hover:border-foreground/30"
                  >
                    <span className="font-medium">{a.question}</span>
                    {a.savedAt && (
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {a.savedAt}
                      </span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>,
    { title: project },
  );
});
