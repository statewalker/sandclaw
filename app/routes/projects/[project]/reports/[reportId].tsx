import { createRoute } from "honox/factory";
import VaultWorkspace from "@/islands/vault-workspace";
import { listProjects, loadReport, reportExists } from "@/lib/reports";

export default createRoute(async (c) => {
  const project = decodeURIComponent(c.req.param("project") ?? "");
  const reportId = decodeURIComponent(c.req.param("reportId") ?? "");
  if (!(await listProjects()).includes(project)) return c.notFound();
  if (!(await reportExists(project, reportId))) return c.notFound();

  const sections = await loadReport(project, reportId);

  return c.render(
    <VaultWorkspace project={project} report={{ id: reportId, sections }} />,
    { title: `${reportId} · ${project}` },
  );
});
