import { createRoute } from "honox/factory";
import { resolvePdfPath } from "@/lib/wiki";
import { filesApi } from "@/lib/wiki-repo";

/** Collect a FilesApi byte stream into a single contiguous (ArrayBuffer-backed) buffer. */
async function readAll(path: string): Promise<Uint8Array<ArrayBuffer>> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of filesApi().read(path)) {
    chunks.push(chunk);
    total += chunk.length;
  }
  const buf = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const chunk of chunks) {
    buf.set(chunk, offset);
    offset += chunk.length;
  }
  return buf;
}

export const GET = createRoute(async (c) => {
  const project = c.req.query("project");
  const file = c.req.query("file");
  if (!project || !file) {
    return c.body("missing 'project' or 'file'", 400);
  }

  // resolvePdfPath rejects `..` segments, so path-traversal in `file` is neutralised.
  const path = await resolvePdfPath(project, file);
  if (!path) {
    return c.body("not found", 404);
  }

  return new Response(await readAll(path), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(file)}"`,
      "Cache-Control": "no-store",
    },
  });
});
