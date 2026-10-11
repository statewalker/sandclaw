// The prototype's storages: real in-memory file systems, mounted side by side
// like the app's local folder, browser storage and S3 buckets.
import type { FilesApi, ListOptions, ReadOptions } from "@statewalker/webrun-files";
import { basename, dirname } from "@statewalker/webrun-files";
import { CompositeFilesApi } from "@statewalker/webrun-files-composite";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { MountUnavailable, type Problem } from "./problem.js";

export interface DemoMount {
  key: string;
  name: string;
  type: "local-folder" | "opfs" | "s3" | "memory";
  files: FilesApi;
  problem?: Problem;
}

const MB = 1024 * 1024;
const bytes = (n: number) => new Uint8Array(n).fill(65);

const SEED: Record<string, Record<string, string | Uint8Array>> = {
  documents: {
    "/notes/todo.md": "# Todo\n\n- [ ] Call Dupont\n- [x] Send the offer\n",
    "/notes/meeting-2026-10-02.md": "# Meeting\n\nBudget agreed.\n",
    "/clients/dupont/offer.pdf": bytes(240_000),
    "/clients/dupont/plan.png": bytes(80_000),
    "/clients/martin/contract.docx": bytes(52_000),
    "/clients/martin/notes.md": "# Martin\n",
    "/reports/2026-q3.xlsx": bytes(31_000),
    "/readme.md": "# Documents\n",
  },
  browser: { "/drafts/letter.md": "# Letter\n" },
  archive: {
    "/2025/clients/dupont/offer-2025.pdf": bytes(210_000),
    "/2025/backup.zip": bytes(12 * MB),
    "/2026/readme.md": "# Archive 2026\n",
  },
  photos: { "/site-visit/01.jpg": bytes(1_400_000), "/site-visit/02.jpg": bytes(1_300_000) },
};

const MOUNTS: Omit<DemoMount, "files">[] = [
  { key: "documents", name: "Documents", type: "local-folder" },
  { key: "browser", name: "Browser storage", type: "opfs" },
  { key: "archive", name: "Archive (S3)", type: "s3" },
  { key: "photos", name: "Photos (S3)", type: "s3" },
];

export function newDemoStorages(
  opts: { slowMs?: number; failPaths?: string[]; unavailable?: Record<string, Problem> } = {},
): { files: FilesApi; mounts: DemoMount[] } {
  const root = new CompositeFilesApi(new MemFilesApi());
  const mounts = MOUNTS.map((m) => {
    const problem = opts.unavailable?.[m.key];
    let files: FilesApi = new MemFilesApi({ initialFiles: SEED[m.key] });
    if (m.type === "s3" && opts.slowMs) files = slowFiles(files, opts.slowMs);
    const fails = (opts.failPaths ?? [])
      .filter((p) => p.startsWith(`/${m.key}/`))
      .map((p) => p.slice(m.key.length + 1));
    if (fails.length) files = failingFiles(files, fails);
    if (problem) files = unavailableFiles(m.key, problem);
    root.mount(`/${m.key}`, files);
    return { ...m, files, problem };
  });
  return { files: root, mounts };
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });

/** Every chunk read or written waits `ms`, and chunks are 256 KB: a visible upload. */
export function slowFiles(api: FilesApi, ms: number): FilesApi {
  return {
    ...bind(api),
    async *read(path: string, options?: ReadOptions) {
      for await (const chunk of api.read(path, options)) {
        for (let i = 0; i < chunk.length; i += 256 * 1024) {
          await sleep(ms, options?.signal);
          yield chunk.subarray(i, i + 256 * 1024);
        }
      }
    },
    async write(path, content) {
      async function* paced() {
        for await (const chunk of content) {
          await sleep(ms);
          yield chunk;
        }
      }
      return api.write(path, paced());
    },
  };
}

/**
 * Writing one of `paths` fails after consuming its content, like a dropped
 * connection. A temporary `.name.part-…` beside it fails too, so an overwrite
 * (written to a temporary name first) fails the same way.
 */
export function failingFiles(api: FilesApi, paths: string[]): FilesApi {
  const fails = (path: string) =>
    paths.some(
      (p) =>
        p === path ||
        (dirname(p) === dirname(path) && basename(path).startsWith(`.${basename(p)}.part-`)),
    );
  return {
    ...bind(api),
    async write(path, content) {
      if (!fails(path)) return api.write(path, content);
      for await (const _ of content) {
        /* drain, then fail */
      }
      throw new Error("Network error: the connection was reset.");
    },
  };
}

/** A mount that cannot be used: every operation raises its problem. */
export function unavailableFiles(key: string, problem: Problem): FilesApi {
  const fail = () => {
    throw new MountUnavailable(key, problem);
  };
  return {
    // biome-ignore lint/correctness/useYield: it only throws
    async *read() {
      fail();
    },
    // biome-ignore lint/correctness/useYield: it only throws
    async *list(_path: string, _options?: ListOptions) {
      fail();
    },
    write: async () => fail(),
    mkdir: async () => fail(),
    stats: async () => fail(),
    exists: async () => fail(),
    remove: async () => fail(),
    move: async () => fail(),
    copy: async () => fail(),
  };
}

function bind(api: FilesApi): FilesApi {
  return {
    read: (p, o) => api.read(p, o),
    write: (p, c) => api.write(p, c),
    mkdir: (p) => api.mkdir(p),
    list: (p, o) => api.list(p, o),
    stats: (p) => api.stats(p),
    exists: (p) => api.exists(p),
    remove: (p) => api.remove(p),
    move: (a, b) => api.move(a, b),
    copy: (a, b) => api.copy(a, b),
  };
}
