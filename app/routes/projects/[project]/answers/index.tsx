import { createRoute } from "honox/factory";
import { MessageSquareText } from "lucide-react";
import { ProjectNav } from "@/components/project-nav";
import { listAnswers, listProjects } from "@/lib/reports";

export default createRoute(async (c) => {
  const project = decodeURIComponent(c.req.param("project") ?? "");
  if (!(await listProjects()).includes(project)) return c.notFound();

  const answers = await listAnswers(project);
  const p = encodeURIComponent(project);

  return c.render(
    <div className="flex min-h-screen flex-col">
      <ProjectNav project={project} section="answers" />
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <h1 className="mb-6 text-xl font-semibold tracking-tight">
          Saved answers
        </h1>
        {answers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No saved answers yet — run a search and save the result.
          </p>
        ) : (
          <ul className="grid gap-3">
            {answers.map((a) => (
              <li key={a.id}>
                <a
                  href={`/projects/${p}/answers/${encodeURIComponent(a.id)}`}
                  className="block rounded-xl border p-4 transition-colors hover:border-foreground/30"
                >
                  <span className="flex items-center gap-2 text-base font-medium">
                    <MessageSquareText className="size-4 shrink-0 text-muted-foreground" />
                    {a.question}
                  </span>
                  {a.savedAt && (
                    <span className="mt-1 block pl-6 text-xs text-muted-foreground">
                      {a.savedAt}
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>,
    { title: `Answers · ${project}` },
  );
});
