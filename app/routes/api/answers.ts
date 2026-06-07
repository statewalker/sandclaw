import { type Answer, WikiSnapshotsAdapter } from "@statewalker/resources-wiki";
import { createRoute } from "honox/factory";
import { getProject } from "@/lib/wiki-repo";

/**
 * Persist a live-search answer as a frozen snapshot via `WikiSnapshotsAdapter`,
 * labelled with its question. Returns the snapshot id (used by the client to link
 * to `/projects/<project>/answers/<id>`).
 */
export const POST = createRoute(async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    project?: string;
    question?: string;
    answer?: Answer;
  } | null;
  const project = body?.project?.trim();
  const question = body?.question?.trim();
  const answer = body?.answer;
  if (!project || !question || !answer) {
    return c.json({ error: "missing 'project', 'question', or 'answer'" }, 400);
  }

  const proj = await getProject(project);
  if (!proj) return c.json({ error: `unknown project '${project}'` }, 404);
  const id = await proj
    .requireAdapter(WikiSnapshotsAdapter)
    .saveAnswer(answer, question);

  return c.json({ file: id, set: "answers", project });
});
