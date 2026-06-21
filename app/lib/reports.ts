import { type Answer, WikiSnapshotsAdapter } from "@statewalker/wiki.core";
import { DEFAULT_SYSTEM_FOLDER } from "@statewalker/workspace.core";
import { answerToSection } from "./answer";
import type { Section } from "./types";
import { filesApi, getProject, workspace } from "./wiki-repo";

/** Payload shape of a `report` snapshot (a run of prompts → answers). */
interface ReportPayload {
  prompts: string[];
  answers: Answer[];
}

/** Project (wiki) directories under the data root — those already scanned. */
export async function listProjects(): Promise<string[]> {
  const ws = workspace();
  const names: string[] = [];
  for (const project of await ws.getProjects()) {
    // A scanned wiki always has its per-project system folder; bare directories
    // without one are not wikis and must not appear.
    if (await filesApi().exists(`${project.projectName}/${DEFAULT_SYSTEM_FOLDER}`)) {
      names.push(project.projectName);
    }
  }
  return names.sort();
}

export interface ReportInfo {
  /** Report snapshot id. */
  id: string;
  title: string;
  sectionCount: number;
}

export interface AnswerInfo {
  /** Answer snapshot id. */
  id: string;
  question: string;
  savedAt?: string;
}

async function snapshots(project: string) {
  const proj = await getProject(project);
  return proj?.requireAdapter(WikiSnapshotsAdapter);
}

/** Report snapshots for a project, chronological by creation. */
export async function listReports(project: string): Promise<ReportInfo[]> {
  const snaps = await snapshots(project);
  if (!snaps) return [];
  const out: { info: ReportInfo; createdAt: string }[] = [];
  for await (const s of snaps.listSnapshots()) {
    if (s.kind !== "report") continue;
    const snap = await snaps.getSnapshot(s.id);
    const payload = snap?.payload as ReportPayload | undefined;
    out.push({
      info: {
        id: s.id,
        title: s.label ?? s.id,
        sectionCount: payload?.answers.length ?? 0,
      },
      createdAt: s.createdAt,
    });
  }
  return out
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((e) => e.info);
}

export async function reportExists(
  project: string,
  reportId: string,
): Promise<boolean> {
  return (await listReports(project)).some((r) => r.id === reportId);
}

/** Sections of one report snapshot — one section per prompt/answer pair. */
export async function loadReport(
  project: string,
  reportId: string,
): Promise<Section[]> {
  const snaps = await snapshots(project);
  const snap = await snaps?.getSnapshot(reportId);
  if (!snap || snap.kind !== "report") return [];
  const payload = snap.payload as ReportPayload;
  return payload.answers.map((answer, i) => {
    const prompt = payload.prompts[i] ?? `Answer ${i + 1}`;
    return answerToSection(answer, prompt, {
      id: `${String(i + 1).padStart(2, "0")}-answer`,
      order: i + 1,
      slug: `answer-${i + 1}`,
    });
  });
}

/** Saved answer snapshots for a project, chronological. */
export async function listAnswers(project: string): Promise<AnswerInfo[]> {
  const snaps = await snapshots(project);
  if (!snaps) return [];
  const out: AnswerInfo[] = [];
  for await (const s of snaps.listSnapshots()) {
    if (s.kind !== "answer") continue;
    out.push({ id: s.id, question: s.label ?? s.id, savedAt: s.createdAt });
  }
  return out.sort((a, b) => (a.savedAt ?? "").localeCompare(b.savedAt ?? ""));
}

/** Load one saved answer snapshot as a renderable section. `null` when absent. */
export async function loadAnswer(
  project: string,
  answerId: string,
): Promise<{ id: string; title: string; section: Section } | null> {
  const snaps = await snapshots(project);
  const snap = await snaps?.getSnapshot(answerId);
  if (!snap || snap.kind !== "answer") return null;
  const title = snap.label ?? answerId;
  return {
    id: answerId,
    title,
    section: answerToSection(snap.payload as Answer, title),
  };
}
