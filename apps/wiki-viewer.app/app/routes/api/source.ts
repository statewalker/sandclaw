import { createRoute } from "honox/factory";
import { resolveCitation } from "@/lib/wiki";

export const GET = createRoute(async (c) => {
  const project = c.req.query("project");
  const uri = c.req.query("uri");
  if (!project || !uri) {
    return c.json({ error: "missing 'project' or 'uri'" }, 400);
  }
  return c.json(await resolveCitation(project, uri));
});
