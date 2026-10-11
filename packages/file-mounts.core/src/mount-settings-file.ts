import type { FilesApi } from "@statewalker/webrun-files";
import { readText, writeText } from "@statewalker/webrun-files";
import { type MountConfig, type MountTypeId, validateKey } from "./mount-config.js";

export const MOUNTS_FILE = "/.files/mounts.json";
const TYPES: MountTypeId[] = ["local-folder", "opfs", "s3", "memory"];

function asConfig(raw: unknown, taken: string[]): MountConfig | undefined {
  const c = raw as Partial<MountConfig> | null;
  if (typeof c?.key !== "string" || validateKey(c.key, taken)) return undefined;
  if (typeof c.name !== "string" || !TYPES.includes(c.type as MountTypeId)) return undefined;
  if (typeof c.config !== "object" || c.config === null) return undefined;
  if (!Object.values(c.config).every((v) => typeof v === "string")) return undefined;
  return {
    key: c.key,
    name: c.name,
    type: c.type as MountTypeId,
    config: c.config,
    ...(c.readOnly ? { readOnly: true } : {}),
    ...(c.mounted === false ? { mounted: false } : {}),
  };
}

/** The saved mounts. A damaged file loads as none, with a problem, and is never rewritten here. */
export async function loadMountConfigs(
  files: FilesApi,
  path = MOUNTS_FILE,
): Promise<{ configs: MountConfig[]; problem?: string }> {
  if (!(await files.exists(path))) return { configs: [] };
  let raw: unknown;
  try {
    raw = JSON.parse(await readText(files, path));
  } catch {
    raw = undefined;
  }
  if (!Array.isArray(raw)) {
    return {
      configs: [],
      problem: "The storage settings file is damaged; it is kept as is until you save.",
    };
  }
  const configs: MountConfig[] = [];
  for (const item of raw) {
    const config = asConfig(
      item,
      configs.map((c) => c.key),
    );
    if (config) configs.push(config);
  }
  const lost = raw.length - configs.length;
  return lost
    ? { configs, problem: `${lost} saved storages could not be read and were left out.` }
    : { configs };
}

export async function saveMountConfigs(
  files: FilesApi,
  configs: MountConfig[],
  path = MOUNTS_FILE,
) {
  await writeText(files, path, JSON.stringify(configs, null, 2));
}
