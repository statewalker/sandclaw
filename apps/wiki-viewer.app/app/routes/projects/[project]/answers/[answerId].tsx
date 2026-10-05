import { createRoute } from "honox/factory";
import VaultWorkspace from "@/islands/vault-workspace";
import { listProjects, loadAnswer } from "@/lib/reports";

export default createRoute(async (c) => {
  const project = decodeURIComponent(c.req.param("project") ?? "");
  const answerId = decodeURIComponent(c.req.param("answerId") ?? "");
  if (!(await listProjects()).includes(project)) return c.notFound();

  const answer = await loadAnswer(project, answerId);
  if (!answer) return c.notFound();

  return c.render(<VaultWorkspace project={project} answer={answer} />, {
    title: `${answer.title} · ${project}`,
  });
});
