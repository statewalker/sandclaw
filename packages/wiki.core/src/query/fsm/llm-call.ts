import type { loggerOf } from "@statewalker/workspace.core";
import {
  costOf,
  type GenerateObjectSpec,
  type LlmApi,
  type LlmCallUsage,
  roundUsd,
  sumCosts,
} from "../../llm/index.js";
import type { QueryProgress } from "../progress.js";

export type QueryLog = ReturnType<typeof loggerOf>;

/** Run one structured-generation call: record it on `progress`, log model/latency/tokens/cost. */
export async function timedGenerate<I, O>(
  llm: LlmApi,
  log: QueryLog,
  progress: QueryProgress,
  spec: GenerateObjectSpec<I, O>,
  extra?: Record<string, unknown>,
): Promise<{ output: O; usage: LlmCallUsage }> {
  const startedAt = Date.now();
  const res = await llm.generateObject(spec);
  const ms = Date.now() - startedAt;
  const cost = costOf(spec.model, res.usage);
  progress.recordLlmCall({
    name: spec.name,
    model: spec.model,
    ms,
    inputTokens: res.usage.inputTokens,
    outputTokens: res.usage.outputTokens,
  });
  log.info("llm call", {
    name: spec.name,
    model: spec.model,
    ms,
    inputTokens: res.usage.inputTokens,
    outputTokens: res.usage.outputTokens,
    inputUsd: roundUsd(cost.inputUsd),
    outputUsd: roundUsd(cost.outputUsd),
    totalUsd: roundUsd(cost.totalUsd),
    ...extra,
  });
  return res;
}

/** Log a per-batch rollup: call count, wall-clock, summed token usage, and summed USD cost. */
export function logBatchTotals(
  log: QueryLog,
  name: string,
  model: string,
  startedAt: number,
  usages: LlmCallUsage[],
): void {
  const cost = sumCosts(usages.map((u) => costOf(model, u)));
  log.info("llm batch totals", {
    name,
    model,
    calls: usages.length,
    ms: Date.now() - startedAt,
    inputTokens: usages.reduce((s, u) => s + u.inputTokens, 0),
    outputTokens: usages.reduce((s, u) => s + u.outputTokens, 0),
    inputUsd: roundUsd(cost.inputUsd),
    outputUsd: roundUsd(cost.outputUsd),
    totalUsd: roundUsd(cost.totalUsd),
  });
}
