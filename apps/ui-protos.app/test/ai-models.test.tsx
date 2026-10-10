import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { AiModels } from "../src/ai-models/ai-models.js";
import { inPeriod, models, total, totalsBy, type UsageRecord } from "../src/ai-models/usage.js";

afterEach(cleanup);

const now = new Date("2026-10-10T10:00:00Z");
const rec = (day: string, peerId: string, modelId: string, input: number, output = 0) => ({
  day,
  personId: peerId.startsWith("peer_c") ? "pk_claire" : "pk_hugo",
  peerId,
  modelId,
  requests: 1,
  inputTokens: input,
  outputTokens: output,
});
const records: UsageRecord[] = [
  rec("2026-10-10", "peer_c1", "claude-sonnet", 1_000_000, 100_000), // $3 + $1.50
  rec("2026-10-08", "peer_c2", "nomic-embed", 500_000), // free
  rec("2026-10-04", "peer_h1", "claude-haiku", 2_000_000), // $2
  rec("2026-09-01", "peer_h1", "claude-sonnet", 9_000_000), // 39 days ago
];

it("totals per person, device and model over a period, with estimated cost", () => {
  const week = inPeriod(records, 7, now);
  expect(total(week, models)).toEqual({
    requests: 3,
    inputTokens: 3_500_000,
    outputTokens: 100_000,
    cost: 6.5,
  });
  const byPerson = totalsBy(week, "personId", models).map((r) => [r.id, r.totals.cost]);
  expect(byPerson).toEqual([
    ["pk_hugo", 2],
    ["pk_claire", 4.5],
  ]);
  expect(totalsBy(week, "peerId", models).map((r) => r.id)).toEqual([
    "peer_h1",
    "peer_c1",
    "peer_c2",
  ]);
  const byModel = totalsBy(inPeriod(records, 90, now), "modelId", models);
  expect(byModel.find((r) => r.id === "claude-sonnet")?.totals.inputTokens).toBe(10_000_000);
  expect(byModel.find((r) => r.id === "nomic-embed")?.totals.cost).toBe(0);
});

it("an empty period totals to zero", () => {
  const empty = inPeriod(records, 7, new Date("2026-12-01T10:00:00Z"));
  expect(empty).toEqual([]);
  expect(total(empty, models)).toEqual({ requests: 0, inputTokens: 0, outputTokens: 0, cost: 0 });
});

it("switching the period changes the totals", () => {
  render(<AiModels />);
  const totals = () => screen.getByRole("region", { name: "Totals" }).textContent;
  const month = totals();
  fireEvent.click(screen.getByRole("button", { name: "Last 7 days" }));
  expect(totals()).not.toBe(month);
});

it("unfolding a person shows their devices", () => {
  render(<AiModels />);
  expect(screen.queryByText("Chrome on Android")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Inès Garnier/ }));
  const list = screen.getByRole("list", { name: "Inès Garnier's devices" });
  expect(within(list).getByText("Edge on Windows")).toBeTruthy();
  expect(within(list).getByText("Chrome on Android")).toBeTruthy();
});

it("changing the search index model asks first and warns about re-indexing", async () => {
  render(<AiModels />);
  const select = screen.getByLabelText(/Search index/) as HTMLSelectElement;
  fireEvent.change(select, { target: { value: "openai-embed" } });
  expect(await screen.findByText(/indexed again/)).toBeTruthy();
  expect(screen.getByText(/sent to OpenAI, outside the office/)).toBeTruthy();
  expect(select.value).toBe("nomic-embed");
  fireEvent.click(screen.getByRole("button", { name: "Switch and re-index" }));
  expect(select.value).toBe("openai-embed");
});
