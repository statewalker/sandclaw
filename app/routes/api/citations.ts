import { createRoute } from "honox/factory";
import { resolveCitationBriefs } from "@/lib/wiki";

export const GET = createRoute(async (c) => {
  const project = c.req.query("project");
  const urisParam = c.req.query("uris");
  if (!project || !urisParam) {
    return c.json({ error: "missing 'project' or 'uris'" }, 400);
  }
  let uris: string[];
  try {
    uris = JSON.parse(urisParam);
    if (!Array.isArray(uris)) throw new Error("not an array");
  } catch {
    return c.json({ error: "'uris' must be a JSON array" }, 400);
  }
  return c.json(await resolveCitationBriefs(project, uris));
});
