// Archive copies of the profile's mounts and preferences in a project's system folder. The vault
// always wins; the copies are read back only on an explicit import. Secrets never go there.
import type { FilesApi } from "@statewalker/webrun-files";
import { joinPath, readText, writeText } from "@statewalker/webrun-files";
import type { MountConfig } from "./mount-config.js";
import { loadMountConfigs, saveMountConfigs } from "./mount-settings-file.js";
import type { ProfileData } from "./secret-vault.js";

export const PROJECT_SYSTEM_DIR = "/.settings";
const MOUNTS = "mounts.json";
const PREFERENCES = "preferences.json";

export interface ProjectArchive {
  mounts: MountConfig[];
  preferences: Record<string, unknown>;
  problem?: string;
}

export async function archiveProfile(
  project: FilesApi,
  data: ProfileData,
  dir = PROJECT_SYSTEM_DIR,
): Promise<void> {
  await saveMountConfigs(project, data.mounts, joinPath(dir, MOUNTS));
  await writeText(project, joinPath(dir, PREFERENCES), JSON.stringify(data.preferences, null, 2));
}

export async function importProfile(
  project: FilesApi,
  dir = PROJECT_SYSTEM_DIR,
): Promise<ProjectArchive> {
  const { configs, problem } = await loadMountConfigs(project, joinPath(dir, MOUNTS));
  const problems = problem ? [problem] : [];
  let preferences: Record<string, unknown> = {};
  const path = joinPath(dir, PREFERENCES);
  if (await project.exists(path)) {
    let raw: unknown;
    try {
      raw = JSON.parse(await readText(project, path));
    } catch {
      raw = undefined;
    }
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      preferences = raw as Record<string, unknown>;
    } else {
      problems.push("The archived preferences are damaged; they were left out.");
    }
  }
  return {
    mounts: configs,
    preferences,
    ...(problems.length ? { problem: problems.join(" ") } : {}),
  };
}

/** The profile's own mounts and preferences win; the archive only adds what is missing. */
export function mergeImported(data: ProfileData, archive: ProjectArchive): ProfileData {
  const taken = new Set(data.mounts.map((m) => m.key));
  return {
    ...data,
    mounts: [...data.mounts, ...archive.mounts.filter((m) => !taken.has(m.key))],
    preferences: { ...archive.preferences, ...data.preferences },
  };
}
