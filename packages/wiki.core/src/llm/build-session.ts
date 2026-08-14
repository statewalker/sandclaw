import { BaseClass } from "@statewalker/shared-baseclass";
import { joinPath as concatPath } from "@statewalker/webrun-files";
import { DEFAULT_SYSTEM_FOLDER, type Project, ProjectAdapter } from "@statewalker/workspace.core";
import { tryReadJson, writeJsonAtomic } from "../util/io.js";
import { roundUsd } from "./pricing.js";
import type { BuildCall } from "./trace.js";

/** Accumulated token + cost usage for a bucket (overall, per-model, or per-stage). */
export interface UsageBucket {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  inputUsd: number;
  outputUsd: number;
  totalUsd: number;
}

function emptyBucket(): UsageBucket {
  return { calls: 0, inputTokens: 0, outputTokens: 0, inputUsd: 0, outputUsd: 0, totalUsd: 0 };
}

function addCall(b: UsageBucket, c: BuildCall): void {
  b.calls += 1;
  b.inputTokens += c.inputTokens;
  b.outputTokens += c.outputTokens;
  b.inputUsd = roundUsd(b.inputUsd + c.inputUsd);
  b.outputUsd = roundUsd(b.outputUsd + c.outputUsd);
  b.totalUsd = roundUsd(b.totalUsd + c.inputUsd + c.outputUsd);
}

/**
 * The reactive build-session stats object (observable via {@link BaseClass.onUpdate}). Public
 * fields serialize to the session JSON; methods are skipped by `toJSON`. Holds the same
 * model / token / price / time stats surfaced in the per-call + per-stage logs, accumulated
 * across the whole build — and carried forward when a prior session was resumed.
 */
export class BuildSession extends BaseClass {
  /** Session id (epoch ms of its start), also embedded in the file name. */
  id = "";
  /** ISO start time of THIS run. */
  startedAt = "";
  /** ISO time of the last stats update. */
  updatedAt = "";
  /** Set true once the build run converges; an unfinished session is resumable. */
  finished = false;
  /** Id of the prior unfinished session this one carried resources forward from, if any. */
  resumedFrom?: string;
  /** Total build wall-clock (ms), including any time carried over from a resumed session. */
  elapsedMs = 0;
  /** Overall token + cost totals. */
  totals: UsageBucket = emptyBucket();
  /** Per-model token + cost totals. */
  models: Record<string, UsageBucket> = {};
  /** Per-stage token + cost totals plus wall-clock attributed to the stage's LLM calls. */
  stages: Record<string, UsageBucket & { ms: number }> = {};

  /** Fold one LLM call into the overall, per-model, and per-stage stats. */
  record(call: BuildCall): void {
    addCall(this.totals, call);
    const model = this.models[call.model] ?? emptyBucket();
    addCall(model, call);
    this.models[call.model] = model;
    const stage = this.stages[call.stage] ?? { ...emptyBucket(), ms: 0 };
    addCall(stage, call);
    stage.ms += call.ms;
    this.stages[call.stage] = stage;
    this.updatedAt = new Date().toISOString();
    this.notify();
  }

  /** Seed accumulators from a prior unfinished session so its resources carry forward. */
  seedFrom(prior: BuildSession): void {
    this.resumedFrom = prior.id;
    this.elapsedMs = prior.elapsedMs;
    this.totals = { ...prior.totals };
    this.models = Object.fromEntries(Object.entries(prior.models).map(([k, v]) => [k, { ...v }]));
    this.stages = Object.fromEntries(Object.entries(prior.stages).map(([k, v]) => [k, { ...v }]));
  }
}

/**
 * Project adapter owning the current build's reactive {@link BuildSession}. Each build run
 * (`begin()` → record … → `finish()`) writes its own JSON under `.project/builds/`. When the
 * latest prior session on disk is unfinished, `begin()` seeds the new session from it so spent
 * time / tokens / prices accumulate across an interrupted-then-restarted build.
 */
export class WikiBuildSession extends ProjectAdapter {
  #session?: BuildSession;
  #filePath?: string;
  #runStartMs = 0;
  #carriedMs = 0;
  #lastPersist = 0;
  #persisting = false;

  /** Persist at most this often during a run (a crash loses at most this much). */
  private static readonly THROTTLE_MS = 3000;

  private get projectPath(): string {
    return this.path.replace(/^\/+|\/+$/g, "");
  }
  private buildsDir(): string {
    return concatPath(this.projectPath, DEFAULT_SYSTEM_FOLDER, "builds");
  }

  /** The current reactive session (undefined before `begin()`). */
  get current(): BuildSession | undefined {
    return this.#session;
  }

  /** Read the latest prior session on disk; return it only when it was left unfinished. */
  private async latestUnfinished(): Promise<BuildSession | undefined> {
    const dir = this.buildsDir();
    const files: string[] = [];
    try {
      for await (const info of this.filesApi.list(dir)) {
        if (info.kind === "file" && info.path.endsWith(".json")) files.push(info.path);
      }
    } catch {
      return undefined; // builds dir absent (first build) — nothing to resume
    }
    if (files.length === 0) return undefined;
    files.sort(); // names are `<date>.build-<epochMs>.json` → chronological
    const data = await tryReadJson<Record<string, unknown>>(
      this.filesApi,
      files[files.length - 1] as string,
    );
    if (!data || data.finished) return undefined;
    return new BuildSession().fromJSON(data);
  }

  /**
   * Start a new build session. If the latest prior session was unfinished, seed this one from it
   * (carry forward elapsed time + token/price totals). Writes the initial session file.
   */
  async begin(): Promise<BuildSession> {
    const session = new BuildSession();
    const prior = await this.latestUnfinished();
    if (prior) session.seedFrom(prior);
    const now = new Date();
    session.id = String(now.getTime());
    session.startedAt = now.toISOString();
    session.updatedAt = session.startedAt;
    session.finished = false;
    this.#carriedMs = prior?.elapsedMs ?? 0;
    session.elapsedMs = this.#carriedMs;
    this.#runStartMs = now.getTime();
    this.#filePath = concatPath(
      this.buildsDir(),
      `${session.startedAt.slice(0, 10)}.build-${session.id}.json`,
    );
    this.#session = session;
    await this.flush();
    return session;
  }

  /** Fold one LLM call into the current session (no-op before `begin()`); throttled-persist. */
  record(call: BuildCall): void {
    const session = this.#session;
    if (!session) return;
    session.record(call);
    session.elapsedMs = this.#carriedMs + (Date.now() - this.#runStartMs);
    void this.maybePersist();
  }

  /** Mark the session finished and write the final stats. */
  async finish(): Promise<void> {
    const session = this.#session;
    if (!session) return;
    session.elapsedMs = this.#carriedMs + (Date.now() - this.#runStartMs);
    session.finished = true;
    session.updatedAt = new Date().toISOString();
    await this.flush();
  }

  private async maybePersist(): Promise<void> {
    if (this.#persisting) return;
    if (Date.now() - this.#lastPersist < WikiBuildSession.THROTTLE_MS) return;
    await this.flush();
  }

  private async flush(): Promise<void> {
    if (!this.#session || !this.#filePath) return;
    this.#persisting = true;
    try {
      await writeJsonAtomic(this.filesApi, this.#filePath, this.#session);
      this.#lastPersist = Date.now();
    } finally {
      this.#persisting = false;
    }
  }
}

/** Resolve the per-project build session adapter (mirrors `wikiConfigOf`). */
export function buildSessionOf(project: Project): WikiBuildSession {
  return project.requireAdapter(WikiBuildSession);
}
