import { createRoute } from "honox/factory";
import VaultWorkspace from "@/islands/vault-workspace";
import { listProjects } from "@/lib/reports";

export default createRoute(async (c) => {
  const project = decodeURIComponent(c.req.param("project") ?? "");
  if (!(await listProjects()).includes(project)) return c.notFound();

  const autoQuery = c.req.query("q")?.trim() || undefined;
  const initialTopic = c.req.query("topic")?.trim() || undefined;

  return c.render(
    <VaultWorkspace
      project={project}
      autoQuery={autoQuery}
      initialTopic={initialTopic}
    />,
    { title: `Search · ${project}` },
  );
});
