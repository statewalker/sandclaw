import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type Answer, answerToYaml } from "@repo/wiki-runtime/embed";
import { createRoute } from "honox/factory";
import { projectAnswersDir } from "@/lib/paths";

/** kebab slug of a question, capped so filenames stay sane. */
function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "answer";
}

/** Filesystem-safe timestamp `YYYY-MM-DDTHH-mm-ss` (alphabetical = chronological). */
function stamp(): string {
  return new Date().toISOString().replace(/:/g, "-").replace(/\..+$/, "");
}

/**
 * Persist a live-search answer as `<project>/answers/<ts>.<slug>.yaml`. The body
 * is the canonical report-section YAML (`answerToYaml`) prefixed with `question`
 * + `savedAt` metadata — extra keys the report reader ignores, so the file
 * doubles as a browsable report section.
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

  const dir = projectAnswersDir(project);
  await mkdir(dir, { recursive: true });
  const file = `${stamp()}.${slugify(question)}.yaml`;
  const doc = `question: ${JSON.stringify(question)}\nsavedAt: ${JSON.stringify(new Date().toISOString())}\n${answerToYaml(answer)}`;
  await writeFile(join(dir, file), doc, "utf8");

  return c.json({ file, set: "answers", project });
});
