import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { dupontBudget, dupontStart, leroyTimber } from "../src/ask/answers.js";
import { IndexSearch } from "../src/explore/explore.js";
import {
  filterByIndex,
  type IndexHit,
  mergeHits,
  notFoundReason,
  passages,
  traceFor,
} from "../src/explore/explore-model.js";
import { HowAnswered } from "../src/explore/how-answered.js";

afterEach(cleanup);

const hit = (index: IndexHit["index"], blockId: string): IndexHit => ({
  index,
  path: "doc.md",
  blockId,
  score: 0.5,
  explain: "",
});

describe("merging what the indexes return", () => {
  const merged = mergeHits({
    words: [hit("words", "b"), hit("words", "a")],
    meaning: [hit("meaning", "b"), hit("meaning", "c")],
    contents: [hit("contents", "c")],
  });

  it("lists each passage once, tagged by every index that found it, with its rank there", () => {
    expect(merged.map((r) => r.blockId)).toEqual(["b", "c", "a"]);
    expect(merged[0]?.foundBy.map((f) => [f.index, f.rank])).toEqual([
      ["words", 1],
      ["meaning", 1],
    ]);
  });

  it("filters by index", () => {
    expect(filterByIndex(merged, "contents").map((r) => r.blockId)).toEqual(["c"]);
    expect(filterByIndex(merged, "all")).toHaveLength(3);
  });
});

describe("how a question was answered", () => {
  it("maps each used passage to its citation number, and says why the rest was not used", () => {
    const trace = traceFor(dupontStart);
    if (!trace) throw new Error("no trace");
    const { used, unused } = passages(trace, dupontStart);
    expect(used.map((u) => [u.n, u.entry.blockId])).toEqual([
      [1, "m2"],
      [2, "o3"],
      [3, "n1"],
    ]);
    expect(used[0]?.sentences).toEqual(["The Dupont job starts on Monday 2 November."]);
    expect(unused.map((u) => [u.entry.blockId, u.reason])).toEqual([
      ["o4", "not-needed"],
      ["m4", "below-threshold"],
    ]);
  });

  it("not found: nothing reached the bar, and the closest passage is named", () => {
    const leroy = traceFor(leroyTimber);
    const budget = traceFor(dupontBudget);
    if (!leroy || !budget) throw new Error("no trace");
    const reason = notFoundReason(leroy);
    expect(reason?.closest?.blockId).toBe("l1");
    expect(reason?.threshold).toBe(0.5);
    expect(reason?.indexes).not.toContain("contents");
    expect(notFoundReason(budget)).toBeNull();
  });
});

it("search results can be filtered by the index that found them", () => {
  render(<IndexSearch query="oak beams" onOpen={() => {}} />);
  const results = () =>
    within(screen.getByRole("list", { name: "Results" })).getAllByRole("listitem");
  const all = results().length;
  fireEvent.click(screen.getByRole("button", { name: /^Topics \d+$/ }));
  const topical = results();
  expect(topical.length).toBeLessThan(all);
  for (const r of topical) expect(within(r).getByText("Topics")).toBeTruthy();
});

it("a timeline step opens to what it returned", () => {
  render(<HowAnswered answer={dupontStart} />);
  expect(screen.queryByRole("region", { name: "Words index" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Searched 4 indexes/ }));
  const words = screen.getByRole("region", { name: "Words index" });
  expect(within(words).getByText("Dupont — notes.md · Dupont")).toBeTruthy();
  expect(
    within(screen.getByRole("region", { name: "Contents index" })).getAllByRole("listitem"),
  ).toHaveLength(2);
});

it("a used passage carries the citation number the answer gives it", () => {
  render(<HowAnswered answer={dupontStart} />);
  const used = within(screen.getByRole("list", { name: "Passages used" })).getAllByRole("listitem");
  expect(within(used[0] as HTMLElement).getByRole("button", { name: "Source 1" })).toBeTruthy();
  expect(within(used[0] as HTMLElement).getByText(/Mr Dupont agreed to start/)).toBeTruthy();
});
