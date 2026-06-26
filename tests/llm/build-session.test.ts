import { describe, expect, it } from "vitest";
import { BuildSession } from "../../src/index.js";

const call = (over: Partial<Parameters<BuildSession["record"]>[0]> = {}) => ({
  stage: "Summarizer",
  model: "m1",
  inputTokens: 100,
  outputTokens: 20,
  inputUsd: 0.01,
  outputUsd: 0.02,
  ms: 500,
  ...over,
});

describe("BuildSession", () => {
  it("accumulates per-model, per-stage, and overall stats and notifies on each call", () => {
    const s = new BuildSession();
    let notified = 0;
    s.onUpdate(() => {
      notified += 1;
    });
    s.record(call());
    s.record(call({ inputTokens: 50, outputTokens: 10, ms: 300 }));
    s.record(
      call({ stage: "MetaExtractor", model: "m2", inputTokens: 10, outputTokens: 5, ms: 100 }),
    );

    expect(notified).toBe(3);
    expect(s.totals.calls).toBe(3);
    expect(s.totals.inputTokens).toBe(160);
    expect(s.totals.outputTokens).toBe(35);
    expect(s.models.m1?.calls).toBe(2);
    expect(s.models.m2?.calls).toBe(1);
    expect(s.stages.Summarizer?.calls).toBe(2);
    expect(s.stages.Summarizer?.ms).toBe(800);
    expect(s.stages.MetaExtractor?.ms).toBe(100);
    expect(s.totals.totalUsd).toBeCloseTo(0.09, 5); // 3 calls × ($0.01 + $0.02)
  });

  it("seeds from a prior unfinished session, carrying totals + elapsed without aliasing it", () => {
    const prior = new BuildSession();
    prior.id = "p1";
    prior.elapsedMs = 5000;
    prior.record(call());

    const next = new BuildSession();
    next.seedFrom(prior);
    expect(next.resumedFrom).toBe("p1");
    expect(next.elapsedMs).toBe(5000);
    expect(next.totals.calls).toBe(1);

    next.record(call());
    expect(next.totals.calls).toBe(2); // accumulates on top of the carried-over total
    expect(prior.totals.calls).toBe(1); // deep-copied — prior is untouched
  });

  it("toJSON exposes the stats fields and round-trips via fromJSON", () => {
    const s = new BuildSession();
    s.id = "x";
    s.finished = true;
    s.record(call());
    const json = s.toJSON();
    expect(json.id).toBe("x");
    expect(json.finished).toBe(true);
    expect(json.totals).toBeDefined();
    expect(Object.keys(json)).not.toContain("record"); // methods skipped

    const restored = new BuildSession().fromJSON(json);
    expect(restored.totals.calls).toBe(1);
    expect(restored.finished).toBe(true);
  });
});
