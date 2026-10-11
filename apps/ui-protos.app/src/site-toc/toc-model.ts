import type { FolderEntry } from "../mock.js";

// The table of contents of a thematic site: a tree of sections, each one a page
// the assistant writes from its sources. Every operation returns a new tree (the
// input is never changed), or an error sentence a person can read.

/** A topic Ask's indexing found in the folder; `theme` is how Ask groups topics. */
export interface Topic {
  id: string;
  name: string;
  /** How many documents the topic covers. */
  docs: number;
  theme: string;
}

export type Source = { kind: "topic"; id: string } | { kind: "file"; path: string };

export interface Section {
  id: string;
  title: string;
  sources: Source[];
  children: Section[];
}

export type Toc = Section[];

export type Place = "before" | "after" | "inside";

export type Result = { toc: Toc } | { error: string };

/** A site menu has two levels: pages, and the pages under them. */
export const MAX_LEVELS = 2;

export const sourceKey = (s: Source) => (s.kind === "topic" ? `topic:${s.id}` : `file:${s.path}`);

export interface Row {
  section: Section;
  depth: number;
  parent: string | null;
}

/** Every section, in reading order. */
export function rows(toc: Toc, depth = 0, parent: string | null = null): Row[] {
  return toc.flatMap((section) => [
    { section, depth, parent },
    ...rows(section.children, depth + 1, section.id),
  ]);
}

export const findRow = (toc: Toc, id: string) => rows(toc).find((r) => r.section.id === id);

const siblingsOf = (toc: Toc, parent: string | null) =>
  parent === null ? toc : (findRow(toc, parent)?.section.children ?? []);

/** How many levels a section takes, itself included. */
const height = (s: Section): number => 1 + Math.max(0, ...s.children.map(height));

/** The tree without `id`, and the section taken out. */
function take(toc: Toc, id: string): [Toc, Section | undefined] {
  let taken: Section | undefined;
  const walk = (list: Section[]): Section[] =>
    list.flatMap((s) => {
      if (s.id === id) {
        taken = s;
        return [];
      }
      return [{ ...s, children: walk(s.children) }];
    });
  return [walk(toc), taken];
}

/** Puts `section` next to or inside `target`; a `null` target is the end of the top level. */
function put(toc: Toc, section: Section, target: string | null, place: Place): Toc {
  if (target === null) return [...toc, section];
  return toc.flatMap((s) => {
    if (s.id !== target) return [{ ...s, children: put(s.children, section, target, place) }];
    if (place === "before") return [section, s];
    if (place === "after") return [s, section];
    return [{ ...s, children: [...s.children, section] }];
  });
}

/** Why `id` can't go there, or undefined when it can. */
export function moveError(
  toc: Toc,
  id: string,
  target: string | null,
  place: Place,
): string | undefined {
  const moved = findRow(toc, id)?.section;
  if (!moved) return "The section is gone.";
  if (
    target !== null &&
    (target === id || rows(moved.children).some((r) => r.section.id === target))
  )
    return "A section can’t go inside itself.";
  const depth =
    target === null ? 0 : (findRow(toc, target)?.depth ?? 0) + (place === "inside" ? 1 : 0);
  if (depth + height(moved) > MAX_LEVELS)
    return "The site has two levels: pages, and the pages under them.";
  return undefined;
}

export function moveSection(toc: Toc, id: string, target: string | null, place: Place): Result {
  const error = moveError(toc, id, target, place);
  if (error) return { error };
  const [rest, moved] = take(toc, id);
  return { toc: put(rest, moved as Section, target, place) };
}

/** Swaps a section with the one above (-1) or below (+1) it at the same level. */
export function moveBy(toc: Toc, id: string, step: -1 | 1): Result {
  const row = findRow(toc, id);
  const list = siblingsOf(toc, row?.parent ?? null);
  const next = list[list.findIndex((s) => s.id === id) + step];
  if (!next) return { error: step < 0 ? "It is already first." : "It is already last." };
  return moveSection(toc, id, next.id, step < 0 ? "before" : "after");
}

/** Makes a section the last one under the section above it. */
export function indent(toc: Toc, id: string): Result {
  const list = siblingsOf(toc, findRow(toc, id)?.parent ?? null);
  const above = list[list.findIndex((s) => s.id === id) - 1];
  if (!above) return { error: "There is no section above to go under." };
  return moveSection(toc, id, above.id, "inside");
}

/** Takes a section out of its parent, right after it. */
export function outdent(toc: Toc, id: string): Result {
  const parent = findRow(toc, id)?.parent;
  if (!parent) return { error: "It is already at the top level." };
  return moveSection(toc, id, parent, "after");
}

let counter = 0;

export function addSection(
  toc: Toc,
  target: string | null,
  place: Place,
  title = "New section",
): { toc: Toc; id: string } {
  const id = `s_new${++counter}`;
  return { toc: put(toc, { id, title, sources: [], children: [] }, target, place), id };
}

export const removeSection = (toc: Toc, id: string) => take(toc, id)[0];

function update(toc: Toc, id: string, change: (s: Section) => Section): Toc {
  return toc.map((s) =>
    s.id === id ? change(s) : { ...s, children: update(s.children, id, change) },
  );
}

export const renameSection = (toc: Toc, id: string, title: string) =>
  update(toc, id, (s) => ({ ...s, title }));

export const attach = (toc: Toc, id: string, source: Source) =>
  update(toc, id, (s) =>
    s.sources.some((x) => sourceKey(x) === sourceKey(source))
      ? s
      : { ...s, sources: [...s.sources, source] },
  );

export const detach = (toc: Toc, id: string, source: Source) =>
  update(toc, id, (s) => ({
    ...s,
    sources: s.sources.filter((x) => sourceKey(x) !== sourceKey(source)),
  }));

// --- Suggest from topics ---

/** Lower case, accents and outer spaces removed: " Été " → "ete". */
const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();

/** One section per theme of Ask's topics, written from the theme's topics. */
export function suggestToc(topics: Topic[]): Toc {
  return [...Map.groupBy(topics, (t) => t.theme)].map(([theme, list]) => ({
    id: `suggested:${fold(theme)}`,
    title: theme,
    sources: list.map((t) => ({ kind: "topic" as const, id: t.id })),
    children: [],
  }));
}

/** One step of a suggestion over an existing TOC, accepted or not by the user. */
export type Proposal =
  | { kind: "add"; section: Section }
  | { kind: "topics"; sectionId: string; title: string; topics: string[] };

/**
 * What a suggestion adds to the user's TOC. It never removes, renames or moves
 * anything: a topic the user already placed somewhere is not proposed again, and
 * a suggested section matches the user's by title, ignoring case and accents.
 */
export function proposals(toc: Toc, suggestion: Toc): Proposal[] {
  const all = rows(toc).map((r) => r.section);
  const used = new Set(all.flatMap((s) => s.sources.map(sourceKey)));
  return suggestion.flatMap((s): Proposal[] => {
    const fresh = s.sources.filter((x) => x.kind === "topic" && !used.has(sourceKey(x)));
    if (!fresh.length) return [];
    const mine = all.find((m) => fold(m.title) === fold(s.title));
    if (!mine) return [{ kind: "add", section: { ...s, sources: fresh } }];
    const topics = fresh.flatMap((x) => (x.kind === "topic" ? [x.id] : []));
    return [{ kind: "topics", sectionId: mine.id, title: mine.title, topics }];
  });
}

export function accept(toc: Toc, p: Proposal): Toc {
  if (p.kind === "add") return [...toc, p.section];
  return p.topics.reduce((t, id) => attach(t, p.sectionId, { kind: "topic", id }), toc);
}

// --- What saving changes on the site ---

export interface PageChanges {
  /** Sections whose page must be written again: new, renamed, or with other sources. */
  rewrite: Set<string>;
  /** Titles of the pages that leave the site. */
  removed: string[];
}

const sourcesOf = (s: Section) => s.sources.map(sourceKey).sort().join("|");

/** Moving a section changes the site's menu, not the page: it is not rewritten. */
export function pageChanges(saved: Toc, current: Toc): PageChanges {
  const before = new Map(rows(saved).map((r) => [r.section.id, r.section]));
  const now = rows(current).map((r) => r.section);
  const rewrite = new Set(
    now
      .filter((s) => {
        const b = before.get(s.id);
        return !b || b.title !== s.title || sourcesOf(b) !== sourcesOf(s);
      })
      .map((s) => s.id),
  );
  const ids = new Set(now.map((s) => s.id));
  const removed = [...before.values()].filter((s) => !ids.has(s.id)).map((s) => s.title);
  return { rewrite, removed };
}

/** The files of the folder, as "/"-joined paths. */
export function filePaths(tree: FolderEntry[], prefix = ""): string[] {
  return tree.flatMap((e) => {
    const path = prefix ? `${prefix}/${e.name}` : e.name;
    return e.children ? filePaths(e.children, path) : [path];
  });
}
