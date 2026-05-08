import { createFileTools } from "@statewalker/ai-agent/tools";
import { Intents } from "@statewalker/shared-intents";
import { newRegistry } from "@statewalker/shared-registry";
import { Slots } from "@statewalker/shared-slots";
import { extname, readFile, writeText } from "@statewalker/webrun-files";
import type { Workspace } from "@statewalker/workspace-api";
import { provideAgentTool } from "@/fragments/agent-runtime";
import {
  observeMimeRenderers,
  // imported for forward-compat; the slot is intentionally unused
  // by the manager — consumers (visualize handler, file-explorer
  // UI) will consume it directly.
} from "../public/extension-points.js";
import {
  handleDeleteFile,
  handleLoadDirectory,
  handleLoadFile,
  handleMoveFile,
  handleVisualizeFile,
  handleWriteFile,
} from "../public/intents.js";
import type {
  DirectoryEntry,
  LoadedFile,
  MimeRenderer,
} from "../public/types.js";

export interface FilesManagerOptions {
  workspace: Workspace;
}

/**
 * Re-entrant orchestrator for the files fragment.
 *
 * On `workspace.onLoad`:
 *   - Contributes a `ToolFactory` to `agent:tools` that closes over
 *     the current `workspace.files`. The agent-runtime manager
 *     observes the slot and rebuilds the AgentRuntime with the
 *     contributed tools.
 *
 * Lifetime-scoped:
 *   - Registers `files:*` intent handlers against the workspace's
 *     primary `FilesApi`. Handlers no-op while the workspace is
 *     closed (they `reject` with a clear error message).
 *
 * `files:visualize` is a stub in Wave 5.1: it picks a matching
 * `MimeRenderer` from the slot but the panel-creation chain
 * (SpecStore + DockHost) lands with the markdown-viewer fragment
 * pair in Wave 5.2.
 */
export class FilesManager {
  private readonly workspace: Workspace;
  private readonly intents: Intents;
  private readonly slots: Slots;
  private readonly _cleanup: () => Promise<void>;
  private _cycleCleanup: Array<() => void> = [];

  constructor({ workspace }: FilesManagerOptions) {
    this.workspace = workspace;
    this.intents = workspace.requireAdapter(Intents);
    this.slots = workspace.requireAdapter(Slots);

    const [register, cleanup] = newRegistry();
    this._cleanup = cleanup;

    // ── Intent handlers (lifetime-scoped) ───────────────────────
    register(
      handleLoadDirectory(this.intents, (intent) => {
        const path = intent.payload?.path ?? "/";
        const recursive = intent.payload?.recursive ?? false;
        void this._loadDirectory(path, recursive)
          .then((entries) => intent.resolve(entries))
          .catch((error) => intent.reject(error));
        return true;
      }),
    );
    register(
      handleLoadFile(this.intents, (intent) => {
        void this._loadFile(intent.payload.path)
          .then((file) => intent.resolve(file))
          .catch((error) => intent.reject(error));
        return true;
      }),
    );
    register(
      handleWriteFile(this.intents, (intent) => {
        void this._writeFile(intent.payload.path, intent.payload.content)
          .then(() => intent.resolve())
          .catch((error) => intent.reject(error));
        return true;
      }),
    );
    register(
      handleMoveFile(this.intents, (intent) => {
        void this._moveFile(intent.payload.fromPath, intent.payload.toPath)
          .then(() => intent.resolve())
          .catch((error) => intent.reject(error));
        return true;
      }),
    );
    register(
      handleDeleteFile(this.intents, (intent) => {
        void this._deleteFile(intent.payload.path)
          .then(() => intent.resolve())
          .catch((error) => intent.reject(error));
        return true;
      }),
    );
    register(
      handleVisualizeFile(this.intents, (intent) => {
        // Wave 5.1 stub: resolve immediately. Wave 5.2 wires the
        // mime-renderer lookup + panel creation.
        const mime = guessMimeType(intent.payload.uri);
        const renderer = pickRenderer(
          this.slots.getSnapshot<MimeRenderer>("files:mime-renderers"),
          mime,
        );
        if (!renderer) {
          intent.reject(new Error(`No mime-renderer registered for "${mime}"`));
          return true;
        }
        // TODO(W5.2): create spec via SpecStore + open via DockHost.
        intent.resolve();
        return true;
      }),
    );
    // Touch the renderer-observe export so it isn't tree-shaken
    // before its consumer (Wave 5.2) lands.
    void observeMimeRenderers;

    // ── Per-cycle: agent:tools contribution ─────────────────────
    register(workspace.onLoad(() => this._onLoad()));
    register(workspace.onUnload(() => this._onUnload()));

    if (workspace.isOpened) this._onLoad();
  }

  async close(): Promise<void> {
    this._onUnload();
    await this._cleanup();
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  private _onLoad(): void {
    const files = this.workspace.files;
    // Contribute a ToolFactory closing over the current files
    // view. AgentRuntime calls the factory during build, passing
    // its own filtered files-tools view (system path hidden).
    this._cycleCleanup.push(
      provideAgentTool(this.slots, (ctx) =>
        createFileTools(ctx.files, { excludedPrefixes: [] }),
      ),
    );
    // Hold a reference so the closure target stays in scope; the
    // factory itself ignores `files` from this scope (uses
    // `ctx.files` which is the agent-runtime tools view), but
    // future overrides (e.g. plug-in path filters) may want it.
    void files;
  }

  private _onUnload(): void {
    for (const dispose of this._cycleCleanup) {
      try {
        dispose();
      } catch (err) {
        console.error("[files] cycle cleanup threw:", err);
      }
    }
    this._cycleCleanup = [];
  }

  // ── Intent handler implementations ────────────────────────────

  private async _loadDirectory(
    path: string,
    recursive: boolean,
  ): Promise<readonly DirectoryEntry[]> {
    this._requireOpen();
    const entries: DirectoryEntry[] = [];
    for await (const info of this.workspace.files.list(path, { recursive })) {
      entries.push({ ...info, mimeType: guessMimeType(info.path) });
    }
    return entries;
  }

  private async _loadFile(path: string): Promise<LoadedFile> {
    this._requireOpen();
    const bytes = await readFile(this.workspace.files, path);
    const stats = await this.workspace.files.stats(path);
    return { path, bytes, stats, mimeType: guessMimeType(path) };
  }

  private async _writeFile(
    path: string,
    content: Uint8Array | string,
  ): Promise<void> {
    this._requireOpen();
    if (typeof content === "string") {
      await writeText(this.workspace.files, path, content);
    } else {
      await this.workspace.files.write(path, [content]);
    }
  }

  private async _moveFile(from: string, to: string): Promise<void> {
    this._requireOpen();
    const ok = await this.workspace.files.move(from, to);
    if (!ok) throw new Error(`move failed: source missing: ${from}`);
  }

  private async _deleteFile(path: string): Promise<void> {
    this._requireOpen();
    await this.workspace.files.remove(path);
  }

  private _requireOpen(): void {
    if (!this.workspace.isOpened) {
      throw new Error(
        "files:* intents require an open workspace — call runChangeWorkspace first",
      );
    }
  }
}

// ── MIME / renderer helpers ─────────────────────────────────────

const MIME_TYPES: Readonly<Record<string, string>> = {
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".txt": "text/plain",
  ".json": "application/json",
  ".js": "text/javascript",
  ".ts": "text/typescript",
  ".tsx": "text/typescript",
  ".jsx": "text/javascript",
  ".html": "text/html",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

export function guessMimeType(pathOrUri: string): string {
  const ext = extname(pathOrUri.replace(/^file:\/\//, "")).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

export function pickRenderer(
  renderers: readonly MimeRenderer[],
  mimeType: string,
): MimeRenderer | undefined {
  const matches = renderers.filter((r) =>
    matchMime(r.mimeTypePattern, mimeType),
  );
  if (matches.length === 0) return undefined;
  matches.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  return matches[0];
}

function matchMime(pattern: string, mimeType: string): boolean {
  if (pattern === mimeType) return true;
  if (!pattern.includes("*")) return false;
  // Convert glob-with-* to a regex anchored at both ends.
  const regex = new RegExp(
    `^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`,
  );
  return regex.test(mimeType);
}
