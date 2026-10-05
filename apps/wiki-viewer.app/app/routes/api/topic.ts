import { createRoute } from "honox/factory";
import { resolveTopic } from "@/lib/wiki";

export const GET = createRoute(async (c) => {
  const project = c.req.query("project");
  const key = c.req.query("key");
  const kind = c.req.query("kind") === "outlier" ? "outlier" : "topic";
  if (!project || !key) {
    return c.json({ error: "missing 'project' or 'key'" }, 400);
  }
  const detail = await resolveTopic(project, key, kind);
  if (!detail) {
    return c.json({ error: "topic not found" }, 404);
  }
  return c.json(detail);
});
