import { readFile } from "node:fs/promises";
import { createRoute } from "honox/factory";
import { resolvePdfPath } from "@/lib/wiki";

export const GET = createRoute(async (c) => {
  const project = c.req.query("project");
  const file = c.req.query("file");
  if (!project || !file) {
    return c.body("missing 'project' or 'file'", 400);
  }

  // resolvePdfPath uses basename(), so path-traversal in `file` is neutralised.
  const path = await resolvePdfPath(project, file);
  if (!path) {
    return c.body("not found", 404);
  }

  const buf = await readFile(path);
  return c.body(new Uint8Array(buf), 200, {
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename="${encodeURIComponent(file)}"`,
    "Cache-Control": "no-store",
  });
});
