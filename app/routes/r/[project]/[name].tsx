import { createRoute } from "honox/factory";
import VaultWorkspace from "@/islands/vault-workspace";
import {
  ANSWERS_SET,
  hasAnswers,
  listReportSetNames,
  listReportSets,
  loadReportSet,
} from "@/lib/reports";

export default createRoute(async (c) => {
  const project = decodeURIComponent(c.req.param("project") ?? "");
  const name = decodeURIComponent(c.req.param("name") ?? "");

  const valid =
    name === ANSWERS_SET
      ? await hasAnswers(project)
      : (await listReportSetNames(project)).includes(name);
  if (!valid) return c.notFound();

  const [sections, allSets] = await Promise.all([
    loadReportSet(project, name),
    listReportSets(),
  ]);

  return c.render(
    <VaultWorkspace
      project={project}
      report={{ name, sections }}
      allSets={allSets}
      initialTab="report"
    />,
    { title: `${project} / ${name === ANSWERS_SET ? "Saved answers" : name}` },
  );
});
