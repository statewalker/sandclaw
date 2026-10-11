import type { Problem } from "./problem.js";

export type MountTypeId = "local-folder" | "opfs" | "s3" | "memory";

export interface MountConfig {
  key: string;
  name: string;
  type: MountTypeId;
  config: Record<string, string>;
  readOnly?: boolean;
  mounted?: boolean;
}

export type MountStatus =
  | { state: "mounted" }
  | { state: "needs-access" }
  | { state: "locked" }
  | { state: "failed"; problem: Problem }
  | { state: "unmounted" };

export interface S3Form {
  name: string;
  key: string;
  preset: S3PresetId;
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
  pathStyle: boolean;
  readOnly: boolean;
}

export type S3PresetId = "aws" | "r2" | "minio" | "b2" | "wasabi" | "other";

export interface S3Preset {
  id: S3PresetId;
  label: string;
  endpoint: string;
  region: string;
  pathStyle: boolean;
  regionRequired: boolean;
}

export const S3_PRESETS: S3Preset[] = [
  {
    id: "aws",
    label: "AWS S3",
    endpoint: "https://s3.<region>.amazonaws.com",
    region: "",
    pathStyle: false,
    regionRequired: true,
  },
  {
    id: "r2",
    label: "Cloudflare R2",
    endpoint: "https://<account-id>.r2.cloudflarestorage.com",
    region: "auto",
    pathStyle: false,
    regionRequired: false,
  },
  {
    id: "minio",
    label: "MinIO / RustFS",
    endpoint: "http://localhost:9000",
    region: "us-east-1",
    pathStyle: true,
    regionRequired: true,
  },
  {
    id: "b2",
    label: "Backblaze B2",
    endpoint: "https://s3.<region>.backblazeb2.com",
    region: "",
    pathStyle: false,
    regionRequired: true,
  },
  {
    id: "wasabi",
    label: "Wasabi",
    endpoint: "https://s3.<region>.wasabisys.com",
    region: "",
    pathStyle: false,
    regionRequired: true,
  },
  {
    id: "other",
    label: "Other S3-compatible",
    endpoint: "",
    region: "",
    pathStyle: true,
    regionRequired: false,
  },
];

function presetById(id: S3PresetId): S3Preset {
  const preset = S3_PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`Unknown S3 preset: ${id}`);
  return preset;
}

/** Fills endpoint, region and addressing from a preset. An empty preset region keeps the form's region; `<region>` is substituted only when a region is known. */
export function applyPreset(form: S3Form, presetId: S3PresetId): S3Form {
  const preset = presetById(presetId);
  const region = preset.region || form.region;
  const endpoint = region ? preset.endpoint.replace(/<region>/g, () => region) : preset.endpoint;
  return { ...form, preset: presetId, endpoint, region, pathStyle: preset.pathStyle };
}

/** A key derived from a name, made unique against `taken` by appending -2, -3, ... */
export function keyFromName(name: string, taken: string[]): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "mount";
  let key = base;
  for (let n = 2; taken.includes(key); n++) key = `${base}-${n}`;
  return key;
}

export function validateKey(key: string, taken: string[]): string | undefined {
  if (key === "") return "Enter a key.";
  if (key.startsWith(".")) return "A key can't start with a dot.";
  if (/[/\\#?% ]/.test(key)) return "Use letters, digits, - and _ only.";
  if (taken.includes(key)) return "Another storage already uses this key.";
  return undefined;
}

export function normalizeEndpoint(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/** Collapses repeated and leading slashes and ends a non-empty prefix with "/". */
export function normalizePrefix(prefix: string): string {
  const parts = prefix.split("/").filter((part) => part !== "");
  return parts.length === 0 ? "" : `${parts.join("/")}/`;
}

function endpointError(endpoint: string): string | undefined {
  if (endpoint.includes("<")) return "Replace the part in <…> with your value.";
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return "Use an https:// address (http:// only for localhost).";
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol === "https:" || (url.protocol === "http:" && local)) return undefined;
  return "Use an https:// address (http:// only for localhost).";
}

export function validateS3Form(
  form: S3Form,
  takenKeys: string[],
): Partial<Record<keyof S3Form, string>> {
  const errors: Partial<Record<keyof S3Form, string>> = {};
  if (form.name.trim() === "") errors.name = "Enter a name.";
  const keyError = validateKey(form.key, takenKeys);
  if (keyError) errors.key = keyError;
  const endpointProblem = endpointError(normalizeEndpoint(form.endpoint));
  if (endpointProblem) errors.endpoint = endpointProblem;
  if (presetById(form.preset).regionRequired && form.region.trim() === "") {
    errors.region = "This provider needs a region.";
  }
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(form.bucket)) {
    errors.bucket = "Bucket names are 3–63 lowercase letters, digits, dots and dashes.";
  }
  if (form.accessKeyId.trim() === "") errors.accessKeyId = "Enter the access key ID.";
  if (form.secretAccessKey.trim() === "") errors.secretAccessKey = "Enter the secret access key.";
  return errors;
}
