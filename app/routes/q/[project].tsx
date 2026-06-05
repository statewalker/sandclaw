import { createRoute } from "honox/factory";
import VaultWorkspace from "@/islands/vault-workspace";
import { listProjects, listReportSets } from "@/lib/reports";

export default createRoute(async (c) => {
  const project = decodeURIComponent(c.req.param("project") ?? "");
  const projects = await listProjects();
  if (!projects.includes(project)) return c.notFound();

  const allSets = await listReportSets();

  return c.render(
    <VaultWorkspace
      project={project}
      report={null}
      allSets={allSets}
      initialTab="search"
    />,
    { title: `Search · ${project}` },
  );
});
