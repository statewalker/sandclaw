import { access, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import {
  dataRoot,
  projectAnswersDir,
  projectReportsDir,
  wikiPagesDir,
} from "./paths";
import type { Citation, Claim, ReportSetInfo, Section, Topic } from "./types";

/**
 * Reserved set name for a project's saved live-search answers. They live under
 * `<project>/answers/` (a sibling of `reports/`), one timestamp-prefixed YAML
 * per answer, listed alphabetically — which, given the prefix, is chronological.
 */
export const ANSWERS_SET = "answers";

function yamlFiles(entries: string[]): string[] {
  return entries.filter((e) => e.endsWith(".yaml") || e.endsWith(".yml"));
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** Title-case a kebab slug: `project-name` -> `Project Name`. */
function titleCase(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Derive ordering + display title from `[tag].NN-slug.yaml`. */
function deriveTitle(filename: string): {
  order: number;
  slug: string;
  title: string;
  id: string;
} {
  const base = filename.replace(/\.ya?ml$/, "");
  const afterTag = base.replace(/^\[[^\]]*\]\./, ""); // drop leading `[tag].`
  const m = afterTag.match(/^(\d+)-(.*)$/);
  if (m) {
    const order = Number.parseInt(m[1], 10);
    const slug = m[2];
    return {
      order,
      slug,
      title: `${order}. ${titleCase(slug)}`,
      id: `${m[1]}-${slug}`,
    };
  }
  return {
    order: 9999,
    slug: afterTag,
    title: titleCase(afterTag),
    id: afterTag,
  };
}

function normCitations(raw: unknown): Citation[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c) =>
      typeof c === "string" ? { uri: c } : { uri: String(c?.uri ?? "") },
    )
    .filter((c) => c.uri);
}

function normClaims(raw: unknown): Claim[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c) => ({
    text: String(c?.text ?? ""),
    citations: normCitations(c?.citations),
  }));
}

function normTopics(raw: unknown): Topic[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((t) => ({
    key: String(t?.key ?? ""),
    name: String(t?.name ?? t?.key ?? ""),
    description: t?.description ? String(t.description) : undefined,
    citations: normCitations(t?.citations),
  }));
}

async function parseYamlFile(path: string): Promise<Record<string, unknown>> {
  const parsed = parse(await readFile(path, "utf8"));
  return parsed && typeof parsed === "object"
    ? (parsed as Record<string, unknown>)
    : {};
}

function toSection(
  filename: string,
  raw: Record<string, unknown>,
  answers: boolean,
): Section {
  const derived = deriveTitle(filename);
  // Answer files carry the originating question; prefer it for the nav title.
  const title =
    answers && typeof raw.question === "string" ? raw.question : derived.title;
  return {
    id: derived.id,
    order: derived.order,
    slug: derived.slug,
    title,
    text: String(raw.text ?? ""),
    claims: normClaims(raw.claims),
    citations: normCitations(raw.citations),
    topics: normTopics(raw.topics),
    outliers: normTopics(raw.outliers),
    suggestions: Array.isArray(raw.suggestions)
      ? raw.suggestions.map(String)
      : [],
  };
}

/** A directory is a report set if its first YAML file has a `text` key. */
async function isReportSet(dir: string): Promise<boolean> {
  try {
    const files = yamlFiles(await readdir(dir));
    if (files.length === 0) return false;
    const sample = await parseYamlFile(join(dir, files[0]));
    return "text" in sample;
  } catch {
    return false;
  }
}

/** Project (wiki) directories under the data root — those with a wiki index. */
export async function listProjects(): Promise<string[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(dataRoot(), { withFileTypes: true });
  } catch {
    return [];
  }
  const projects: string[] = [];
  for (const e of entries) {
    if (e.isDirectory() && (await exists(wikiPagesDir(e.name))))
      projects.push(e.name);
  }
  return projects.sort();
}

/** Report set names under `<project>/reports/`. */
export async function listReportSetNames(project: string): Promise<string[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(projectReportsDir(project), {
      withFileTypes: true,
    });
  } catch {
    return [];
  }
  const names: string[] = [];
  for (const e of entries) {
    if (
      e.isDirectory() &&
      (await isReportSet(join(projectReportsDir(project), e.name)))
    ) {
      names.push(e.name);
    }
  }
  return names.sort();
}

/** True when `<project>/answers/` holds at least one saved answer. */
export async function hasAnswers(project: string): Promise<boolean> {
  try {
    return yamlFiles(await readdir(projectAnswersDir(project))).length > 0;
  } catch {
    return false;
  }
}

/**
 * Load a collection's sections, sorted. Report sets order by their filename
 * `NN` prefix; the reserved {@link ANSWERS_SET} collection loads from
 * `<project>/answers/` and orders alphabetically by filename (chronological,
 * via the timestamp prefix).
 */
export async function loadReportSet(
  project: string,
  name: string,
): Promise<Section[]> {
  const answers = name === ANSWERS_SET;
  const dir = answers
    ? projectAnswersDir(project)
    : join(projectReportsDir(project), name);
  const files = yamlFiles(await readdir(dir));
  if (answers) files.sort();
  const rows: Array<{ file: string; section: Section }> = [];
  for (const file of files) {
    const raw = await parseYamlFile(join(dir, file));
    rows.push({ file, section: toSection(file, raw, answers) });
  }
  if (!answers) rows.sort((a, b) => a.section.order - b.section.order);
  return rows.map((r) => r.section);
}

/** Every collection across every project: report sets, then the answers set. */
export async function listReportSets(): Promise<ReportSetInfo[]> {
  const projects = await listProjects();
  const out: ReportSetInfo[] = [];
  for (const project of projects) {
    for (const name of await listReportSetNames(project)) {
      const sections = await loadReportSet(project, name);
      out.push({ project, name, sectionCount: sections.length });
    }
    if (await hasAnswers(project)) {
      const sections = await loadReportSet(project, ANSWERS_SET);
      out.push({ project, name: ANSWERS_SET, sectionCount: sections.length });
    }
  }
  return out;
}
