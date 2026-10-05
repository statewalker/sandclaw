import { createRoute } from "honox/factory";
import { ProjectNav } from "@/components/project-nav";
import TopicsList from "@/islands/topics-list";
import { listProjects } from "@/lib/reports";
import { listTopics } from "@/lib/wiki";

export default createRoute(async (c) => {
  const project = decodeURIComponent(c.req.param("project") ?? "");
  if (!(await listProjects()).includes(project)) return c.notFound();

  const topics = await listTopics(project);

  return c.render(
    <div className="flex min-h-screen flex-col">
      <ProjectNav project={project} section="topics" />
      <TopicsList project={project} topics={topics} />
    </div>,
    { title: `Topics · ${project}` },
  );
});
