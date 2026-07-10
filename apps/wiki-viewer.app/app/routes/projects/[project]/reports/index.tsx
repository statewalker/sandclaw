import { createRoute } from "honox/factory";
import { FileText } from "lucide-react";
import { ProjectNav } from "@/components/project-nav";
import { listProjects, listReports } from "@/lib/reports";

export default createRoute(async (c) => {
  const project = decodeURIComponent(c.req.param("project") ?? "");
  if (!(await listProjects()).includes(project)) return c.notFound();

  const reports = await listReports(project);
  const p = encodeURIComponent(project);

  return c.render(
    <div className="flex min-h-screen flex-col">
      <ProjectNav project={project} section="reports" />
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <h1 className="mb-6 text-xl font-semibold tracking-tight">Reports</h1>
        {reports.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No reports in this wiki.
          </p>
        ) : (
          <ul className="grid gap-3">
            {reports.map((r) => (
              <li key={r.id}>
                <a
                  href={`/projects/${p}/reports/${encodeURIComponent(r.id)}`}
                  className="flex items-center justify-between rounded-xl border p-4 transition-colors hover:border-foreground/30"
                >
                  <span className="flex items-center gap-2 text-base font-medium">
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    {r.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {r.sectionCount} sections
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>,
    { title: `Reports · ${project}` },
  );
});
