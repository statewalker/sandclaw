import type { loggerOf } from "@statewalker/workspace.core";
import type { GenerateObjectSpec, LlmApi, LlmCallUsage } from "./llm-adapter.js";
import { costOf, roundUsd, sumCosts } from "./pricing.js";

type BuildLog = ReturnType<typeof loggerOf>;

/**
 * Per-build-stage LLM tracer. Wraps each structured-generation call with model / latency /
 * token / USD-cost logging (mirroring the query side's `timedGenerate`), accumulates the calls,
 * and emits a per-model + overall rollup via {@link totals}. Stages with no `progress` object
 * (all the build builders) use this instead.
 */
export class BuildTracer {
  private readonly calls: { model: string; usage: LlmCallUsage }[] = [];
  private readonly startedAt = Date.now();

  constructor(
    private readonly log: BuildLog,
    private readonly stage: string,
  ) {}

  /**
   * Wrap an `LlmApi` so every `generateObject` it makes is traced + accumulated here, without
   * threading the tracer through helper signatures. Text/embedding calls pass through untraced
   * (embeddings carry no token usage). Use the returned api inside a stage; call {@link totals} after.
   */
  wrap(llm: LlmApi): LlmApi {
    return {
      generateObject: (spec) => this.generate(llm, spec),
      generateText: (spec) => llm.generateText(spec),
      streamText: (spec) => llm.streamText(spec),
      embed: (text, model) => llm.embed(text, model),
      embedBatch: (texts, model) => llm.embedBatch(texts, model),
    };
  }

  /** Run one `generateObject`, log its model/latency/tokens/cost, and accumulate it for the rollup. */
  async generate<I, O>(
    llm: LlmApi,
    spec: GenerateObjectSpec<I, O>,
    extra?: Record<string, unknown>,
  ): Promise<{ output: O; usage: LlmCallUsage }> {
    const startedAt = Date.now();
    const res = await llm.generateObject(spec);
    const ms = Date.now() - startedAt;
    const cost = costOf(spec.model, res.usage);
    this.calls.push({ model: spec.model, usage: res.usage });
    this.log.info("llm call", {
      stage: this.stage,
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

  /** Emit the stage rollup: per-model and overall call count, wall-clock, tokens, and USD cost. */
  totals(extra?: Record<string, unknown>): void {
    if (this.calls.length === 0) return;
    const ms = Date.now() - this.startedAt;
    const byModel = new Map<string, LlmCallUsage[]>();
    for (const c of this.calls) {
      const list = byModel.get(c.model) ?? [];
      list.push(c.usage);
      byModel.set(c.model, list);
    }
    const perModel = [...byModel.entries()].map(([model, usages]) => {
      const cost = sumCosts(usages.map((u) => costOf(model, u)));
      return {
        model,
        calls: usages.length,
        inputTokens: usages.reduce((s, u) => s + u.inputTokens, 0),
        outputTokens: usages.reduce((s, u) => s + u.outputTokens, 0),
        inputUsd: roundUsd(cost.inputUsd),
        outputUsd: roundUsd(cost.outputUsd),
        totalUsd: roundUsd(cost.totalUsd),
      };
    });
    const overall = sumCosts(this.calls.map((c) => costOf(c.model, c.usage)));
    this.log.info("stage llm totals", {
      stage: this.stage,
      calls: this.calls.length,
      ms,
      inputTokens: this.calls.reduce((s, c) => s + c.usage.inputTokens, 0),
      outputTokens: this.calls.reduce((s, c) => s + c.usage.outputTokens, 0),
      inputUsd: roundUsd(overall.inputUsd),
      outputUsd: roundUsd(overall.outputUsd),
      totalUsd: roundUsd(overall.totalUsd),
      perModel,
      ...extra,
    });
  }
}
