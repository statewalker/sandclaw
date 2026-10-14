#!/usr/bin/env tsx
/**
 * Run the evaluation questions through the wiki query pipeline and record, per
 * question, the answer plus a per-stage trace: every structured LLM call's name and
 * output (intent, hypotheses, rolling summaries, compose) and every query log record
 * (hybrid search hits, selected sections, kept sections, routing).
 *
 * usage: tsx eval/run.ts <workspace-root> <project> <questions.json> <out-dir>
 *          [--mode lean-first|full-only] [--shard i/n] [--ids a,b,c] [--rerank <model>|off]
 *
 * One JSON per question in <out-dir>/answers/<id>.json; existing files are skipped, so
 * an interrupted run resumes. Providers come from the environment (WIKI_PROVIDER, keys).
 */
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NodeFilesApi } from "@statewalker/webrun-files-node";
import { type Logger, LoggerAdapter, Workspace } from "@statewalker/workspace.core";
import {
  costOf,
  LlmProjectAdapter,
  registerWiki,
  resolveProvidersFromEnv,
  WikiQuery,
  wikiConfigOf,
} from "../src/index.js";

interface Item {
  id: string;
  question: string;
}
interface TraceLog {
  t: number;
  logger: string;
  msg: string;
  extra?: unknown;
}
interface TraceCall {
  t: number;
  name: string;
  model: string;
  ms: number;
  output?: unknown;
  error?: string;
}

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const mode = (flag("--mode") ?? "lean-first") as "lean-first" | "full-only";
const shard = flag("--shard");
const ids = flag("--ids")?.split(",");
const rerank = flag("--rerank");
const [root, projectKey, questionsPath, outDir] = args;
if (!root || !projectKey || !questionsPath || !outDir) {
  console.error(
    "usage: run.ts <workspace-root> <project> <questions.json> <out-dir> [--mode m] [--shard i/n] [--ids a,b] [--rerank model]",
  );
  process.exit(2);
}

// The trace of the question currently running (one at a time per process).
let logs: TraceLog[] = [];
let calls: TraceCall[] = [];
const t0 = () => Date.now();

function capturing(name: string): Logger {
  const rec =
    (level: string) =>
    (...a: unknown[]) => {
      if (level === "debug" || level === "trace") return;
      logs.push({ t: t0(), logger: name, msg: String(a[0]), extra: a[1] });
    };
  const l: Logger = {
    level: "info",
    fatal: rec("fatal"),
    error: rec("error"),
    warn: rec("warn"),
    info: rec("info"),
    debug: rec("debug"),
    trace: rec("trace"),
    child: () => l,
  };
  return l;
}
class CapturingLoggerAdapter extends LoggerAdapter {
  override newLogger(key: string): Logger {
    return capturing(key);
  }
}

// Record every structured call's output — the stage outputs the logs do not carry.
const original = LlmProjectAdapter.prototype.generateObject;
LlmProjectAdapter.prototype.generateObject = async function (this: LlmProjectAdapter, spec) {
  const started = t0();
  try {
    const res = await original.call(this, spec);
    calls.push({
      t: started,
      name: spec.name,
      model: spec.model,
      ms: t0() - started,
      output: res.output,
    });
    return res;
  } catch (e) {
    calls.push({
      t: started,
      name: spec.name,
      model: spec.model,
      ms: t0() - started,
      error: String(e),
    });
    throw e;
  }
} as typeof original;

const workspace = new Workspace().setFileSystem(new NodeFilesApi({ rootDir: root }));
await workspace.open();
const makeLogger = (host: unknown) => new CapturingLoggerAdapter(host);
workspace.setAdapter(LoggerAdapter, makeLogger);
workspace.adaptersRegistry.register("project", LoggerAdapter, makeLogger);
registerWiki(workspace, { provider: resolveProvidersFromEnv(process.env).provider });
const project = await workspace.getProject(projectKey, false);
if (!project) throw new Error(`project not found: ${projectKey}`);
const cfg = await wikiConfigOf(project).load();
// The run's routing mode (and, with --rerank, the selection rerank and its model) override the
// project file in memory only.
(cfg as unknown as { cfg: Record<string, unknown> }).cfg = {
  ...cfg.data,
  queryMode: mode,
  ...(rerank === "off"
    ? { selectRerank: false }
    : rerank
      ? { selectRerank: true, models: { ...cfg.data.models, querySelect: rerank } }
      : {}),
};

let items = JSON.parse(await readFile(questionsPath, "utf8")) as Item[];
if (ids) items = items.filter((it) => ids.includes(it.id));
if (shard) {
  const [i, n] = shard.split("/").map(Number) as [number, number];
  items = items.filter((_, k) => k % n === i);
}
const answersDir = join(outDir, "answers");
await mkdir(answersDir, { recursive: true });

for (const it of items) {
  const file = join(answersDir, `${it.id}.json`);
  if (await stat(file).catch(() => null)) continue;
  logs = [];
  calls = [];
  const started = t0();
  const progress = project.requireAdapter(WikiQuery).ask(it.question);
  let answer: unknown;
  let error: string | undefined;
  try {
    answer = await progress.complete();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const usd = progress.llmCalls.reduce(
    (s, c) =>
      s + costOf(c.model, { inputTokens: c.inputTokens, outputTokens: c.outputTokens }).totalUsd,
    0,
  );
  await writeFile(
    file,
    `${JSON.stringify(
      {
        id: it.id,
        question: it.question,
        mode,
        answer,
        error,
        stats: {
          ms: t0() - started,
          usd,
          calls: progress.llmCalls.length,
          queryKind: progress.queryKind,
          escalated: progress.escalated,
          stages: progress.stages.map((s) => ({ name: s.name, ms: s.ms })),
        },
        trace: { calls, logs },
      },
      null,
      2,
    )}\n`,
  );
  console.error(
    `${it.id}: ${error ? `ERROR ${error}` : "ok"} ${(t0() - started) / 1000}s $${usd.toFixed(4)}`,
  );
}
