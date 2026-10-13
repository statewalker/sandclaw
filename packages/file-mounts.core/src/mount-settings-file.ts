import type { FilesApi } from "@statewalker/webrun-files";
import { dirname, joinPath, readText, writeText } from "@statewalker/webrun-files";
import { type MountConfig, type MountTypeId, validateKey } from "./mount-config.js";

export const MOUNTS_FILE = "/.settings/mounts.json";
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

/** Reads the file's text; `problem` says what could not be used. */
function parseConfigs(text: string): { configs: MountConfig[]; problem?: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
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
  if (!lost) return { configs };
  const what = lost === 1 ? "1 saved storage" : `${lost} saved storages`;
  return {
    configs,
    problem: `${what} could not be read and ${lost === 1 ? "was" : "were"} left out.`,
  };
}

/** The saved mounts. A damaged file loads as none, with a problem, and is never rewritten here. */
export async function loadMountConfigs(
  files: FilesApi,
  path = MOUNTS_FILE,
): Promise<{ configs: MountConfig[]; problem?: string }> {
  if (!(await files.exists(path))) return { configs: [] };
  return parseConfigs(await readText(files, path));
}

/**
 * Writes the mounts. A file that does not load cleanly is first copied, as it was, to
 * `mounts.damaged-<timestamp>.json` beside it: the save never silently drops what it couldn't read.
 */
export async function saveMountConfigs(
  files: FilesApi,
  configs: MountConfig[],
  path = MOUNTS_FILE,
) {
  if (await files.exists(path)) {
    const text = await readText(files, path);
    if (parseConfigs(text).problem) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      await writeText(files, joinPath(dirname(path), `mounts.damaged-${stamp}.json`), text);
    }
  }
  await writeText(files, path, JSON.stringify(configs, null, 2));
}
