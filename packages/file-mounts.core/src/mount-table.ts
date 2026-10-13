// The mounts composed into one FilesApi: each storage at /<key>, under a
// read-only root that lists them. A mount that can't be used stays in the table
// with its status, and reading it raises MountUnavailable with the reason.
import { BaseClass } from "@statewalker/shared-baseclass";
import type { FilesApi } from "@statewalker/webrun-files";
import { CompositeFilesApi, readOnly } from "@statewalker/webrun-files-composite";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import type { FileChange } from "./changes.js";
import { type MountConfig, type MountStatus, validateKey } from "./mount-config.js";
import { type MountType, NeedsUserGesture } from "./mount-type.js";
import { MountUnavailable, type Problem, problemOf } from "./problem.js";
import { type SecretStore, SecretsLocked } from "./secret-vault.js";
import { unavailableFiles } from "./unavailable-files.js";

export interface MountTable {
  readonly files: FilesApi;
  list(): { config: MountConfig; status: MountStatus }[];
  apply(configs: MountConfig[]): Promise<FileChange[]>;
  reconnect(key: string): Promise<MountStatus>;
  onUpdate(listener: () => void): () => void;
}

interface Entry {
  config: MountConfig;
  status: MountStatus;
  api: FilesApi;
}

class TimedOut extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimedOut()), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const canonical = (c: MountConfig) =>
  JSON.stringify([
    c.type,
    Object.entries(c.config).sort(([a], [b]) => a.localeCompare(b)),
    Boolean(c.readOnly),
    c.mounted !== false,
  ]);

/** A FilesApi whose target can be swapped: the table's `files` stays the same object. */
function switchable(initial: FilesApi) {
  let current = initial;
  const api: FilesApi = {
    read: (p, o) => current.read(p, o),
    write: (p, c) => current.write(p, c),
    mkdir: (p) => current.mkdir(p),
    list: (p, o) => current.list(p, o),
    stats: (p) => current.stats(p),
    exists: (p) => current.exists(p),
    remove: (p) => current.remove(p),
    move: (a, b) => current.move(a, b),
    copy: (a, b) => current.copy(a, b),
  };
  return { api, set: (next: FilesApi) => (current = next) };
}

const emptyRoot = () => readOnly(new MemFilesApi());

function problemFor(config: MountConfig, status: MountStatus): Problem | undefined {
  switch (status.state) {
    case "locked":
      return { cause: "locked", message: "Locked: unlock to use the S3 storages." };
    case "needs-access":
      return {
        cause: "needs-access",
        message: `Click Reconnect to give access to ${config.config.directory ?? config.name} again.`,
      };
    case "failed":
      return status.problem;
    default:
      return undefined;
  }
}

export class FilesMountTable extends BaseClass implements MountTable {
  readonly files: FilesApi;
  private readonly root = switchable(emptyRoot());
  private entries: Entry[] = [];
  private queue: Promise<void> = Promise.resolve();
  private readonly types: Map<string, MountType>;
  private readonly secrets: Pick<SecretStore, "state" | "get">;
  private readonly createTimeoutMs: number;

  constructor(opts: {
    types: MountType[];
    secrets: Pick<SecretStore, "state" | "get">;
    createTimeoutMs?: number;
  }) {
    super();
    this.types = new Map(opts.types.map((t) => [t.id, t]));
    this.secrets = opts.secrets;
    this.createTimeoutMs = opts.createTimeoutMs ?? 15_000;
    this.files = this.root.api;
  }

  list() {
    return this.entries.map(({ config, status }) => ({ config, status }));
  }

  configs(): MountConfig[] {
    return this.entries.map((e) => e.config);
  }

  /** Keeps unchanged mounted storages, (re)creates the others; call again after an unlock. */
  apply(configs: MountConfig[], opts: { interactive?: boolean } = {}): Promise<FileChange[]> {
    const taken: string[] = [];
    for (const config of configs) {
      const invalid = validateKey(config.key, taken);
      if (invalid) return Promise.reject(new Error(`${invalid} (${config.key})`));
      taken.push(config.key);
    }
    return this.enqueue(() => this.applyNow(configs, opts.interactive ?? false));
  }

  /** Inside a click: asks for access again (local folder) or retries a failed mount. */
  reconnect(key: string): Promise<MountStatus> {
    return this.enqueue(async () => {
      const entry = this.entries.find((e) => e.config.key === key);
      if (!entry) return { state: "unmounted" };
      const created = await this.create(entry.config, true);
      const at = this.entries.findIndex((e) => e.config.key === key);
      if (at < 0 || this.entries[at]?.config !== entry.config) {
        return this.entries[at]?.status ?? { state: "unmounted" };
      }
      this.entries = this.entries.map((e, i) => (i === at ? created : e));
      this.recompose();
      return created.status;
    });
  }

  /** apply and reconnect run one after another, in the order called; a failure doesn't stall the rest. */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async applyNow(configs: MountConfig[], interactive: boolean): Promise<FileChange[]> {
    const before = new Map(this.entries.map((e) => [e.config.key, e]));
    const next = await Promise.all(
      configs.map((config) => {
        const old = before.get(config.key);
        const keep =
          old && old.status.state === "mounted" && canonical(old.config) === canonical(config);
        return keep ? Promise.resolve({ ...old, config }) : this.create(config, interactive);
      }),
    );
    const changes: FileChange[] = [];
    const after = new Set(next.map((e) => e.config.key));
    for (const key of before.keys()) {
      if (!after.has(key)) changes.push({ type: "deleted", path: `/${key}` });
    }
    for (const entry of next) {
      const old = before.get(entry.config.key);
      if (!old) changes.push({ type: "added", path: `/${entry.config.key}` });
      else if (old.api !== entry.api)
        changes.push({ type: "updated", path: `/${entry.config.key}` });
    }
    this.entries = next;
    this.recompose();
    return changes;
  }

  private async create(config: MountConfig, interactive: boolean): Promise<Entry> {
    const failed = (problem: Problem): Entry => this.unusable(config, { state: "failed", problem });
    if (config.mounted === false) return this.unusable(config, { state: "unmounted" });
    const type = this.types.get(config.type);
    if (!type) {
      return failed({
        cause: "invalid-settings",
        message: `Unknown storage type: ${config.type}.`,
      });
    }
    const available = type.isAvailable();
    if (!available.ok) return failed({ cause: "invalid-settings", message: available.reason });
    const ctx = {
      interactive,
      secret: async (field: string) => {
        if (this.secrets.state !== "unlocked") throw new SecretsLocked();
        return this.secrets.get(`${config.key}/${field}`);
      },
    };
    try {
      // A person answering a permission prompt sets the pace; every other create times out.
      const creating = type.create(config, ctx);
      const waits = interactive && type.prompts;
      const api = await (waits ? creating : withTimeout(creating, this.createTimeoutMs));
      return { config, status: { state: "mounted" }, api: config.readOnly ? readOnly(api) : api };
    } catch (error) {
      if (error instanceof SecretsLocked) return this.unusable(config, { state: "locked" });
      if (error instanceof NeedsUserGesture)
        return this.unusable(config, { state: "needs-access" });
      if (error instanceof TimedOut) {
        return failed({ cause: "timeout", message: "No answer in 15 seconds." });
      }
      if (error instanceof MountUnavailable) return failed(error.problem);
      return failed(problemOf(error));
    }
  }

  private unusable(config: MountConfig, status: MountStatus): Entry {
    const problem = problemFor(config, status);
    return {
      config,
      status,
      api: unavailableFiles(config.key, problem ?? { cause: "unknown", message: "" }),
    };
  }

  private recompose() {
    const root = new CompositeFilesApi(emptyRoot());
    for (const entry of this.entries) {
      if (entry.status.state !== "unmounted") root.mount(`/${entry.config.key}`, entry.api);
    }
    this.root.set(root);
    this.notify();
  }
}
