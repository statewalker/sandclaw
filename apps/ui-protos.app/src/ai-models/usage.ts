import { people, today } from "../mock.js";

/** The jobs the hub gives to a model; one model per job for the whole group. */
export type Job = "chat" | "summaries" | "embeddings";

export const jobs: Job[] = ["chat", "summaries", "embeddings"];

/** A model LiteLLM serves, as the hub reads it through the LLM admin API. */
export interface Model {
  id: string;
  name: string;
  /** Who runs it: "Anthropic", "OpenAI", or "the hub" for a local model. */
  provider: string;
  /** `hub`: runs on the Sandclaw machine, text stays in the office; `cloud`: text leaves it. */
  where: "hub" | "cloud";
  /** The jobs the model can do: an embedding model can only index. */
  canDo: Job[];
  /** US dollars per million tokens; 0 for a local model. */
  pricePerMillion: { input: number; output: number };
  /** LiteLLM's last health check answered. */
  reachable: boolean;
}

export const models: Model[] = [
  {
    id: "claude-sonnet",
    name: "Claude Sonnet",
    provider: "Anthropic",
    where: "cloud",
    canDo: ["chat", "summaries"],
    pricePerMillion: { input: 3, output: 15 },
    reachable: true,
  },
  {
    id: "claude-haiku",
    name: "Claude Haiku",
    provider: "Anthropic",
    where: "cloud",
    canDo: ["chat", "summaries"],
    pricePerMillion: { input: 1, output: 5 },
    reachable: true,
  },
  {
    id: "llama-8b",
    name: "Llama 3.1 8B",
    provider: "the hub",
    where: "hub",
    canDo: ["chat", "summaries"],
    pricePerMillion: { input: 0, output: 0 },
    reachable: true,
  },
  {
    id: "nomic-embed",
    name: "Nomic Embed",
    provider: "the hub",
    where: "hub",
    canDo: ["embeddings"],
    pricePerMillion: { input: 0, output: 0 },
    reachable: true,
  },
  {
    id: "openai-embed",
    name: "OpenAI Embedding small",
    provider: "OpenAI",
    where: "cloud",
    canDo: ["embeddings"],
    pricePerMillion: { input: 0.02, output: 0 },
    reachable: true,
  },
];

export type Assignment = Record<Job, string>;

export const assignment: Assignment = {
  chat: "claude-sonnet",
  summaries: "claude-haiku",
  embeddings: "nomic-embed",
};

/** One day of one device's calls to one model, as the hub tags them (person + peer). */
export interface UsageRecord {
  /** "2026-10-09", UTC. */
  day: string;
  personId: string;
  peerId: string;
  modelId: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
}

/** How far back the usage looks, in days, today included. */
export type Period = 7 | 30 | 90;

export interface Totals {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  /** Estimated, in US dollars, from the model's price list. */
  cost: number;
}

const DAY = 24 * 60 * 60 * 1000;

const dayOf = (date: Date) => date.toISOString().slice(0, 10);

/** Whole days between `day` and `now`; 0 for today. */
export function daysAgo(day: string, now: Date) {
  return Math.floor((Date.parse(dayOf(now)) - Date.parse(day)) / DAY);
}

export function inPeriod(records: UsageRecord[], period: Period, now: Date) {
  return records.filter((r) => {
    const ago = daysAgo(r.day, now);
    return ago >= 0 && ago < period;
  });
}

export function cost(record: UsageRecord, all: Model[]) {
  const price = all.find((m) => m.id === record.modelId)?.pricePerMillion;
  if (!price) return 0;
  return (record.inputTokens * price.input + record.outputTokens * price.output) / 1e6;
}

export function total(records: UsageRecord[], all: Model[]): Totals {
  const t: Totals = { requests: 0, inputTokens: 0, outputTokens: 0, cost: 0 };
  for (const r of records) {
    t.requests += r.requests;
    t.inputTokens += r.inputTokens;
    t.outputTokens += r.outputTokens;
    t.cost += cost(r, all);
  }
  return t;
}

export const tokens = (t: Totals) => t.inputTokens + t.outputTokens;

/** Totals per person, device or model, the biggest consumer first. */
export function totalsBy(
  records: UsageRecord[],
  key: "personId" | "peerId" | "modelId",
  all: Model[],
): { id: string; totals: Totals }[] {
  return [...Map.groupBy(records, (r) => r[key])]
    .map(([id, rs]) => ({ id, totals: total(rs, all) }))
    .sort((a, b) => tokens(b.totals) - tokens(a.totals));
}

/** Tokens per day of the period, oldest first, split by where the model runs. */
export function perDay(records: UsageRecord[], period: Period, now: Date, all: Model[]) {
  const days = Array.from({ length: period }, (_, i) => ({
    day: dayOf(new Date(now.getTime() - (period - 1 - i) * DAY)),
    hub: 0,
    cloud: 0,
  }));
  for (const r of inPeriod(records, period, now)) {
    const slot = days[period - 1 - daysAgo(r.day, now)];
    const where = all.find((m) => m.id === r.modelId)?.where ?? "cloud";
    if (slot) slot[where] += r.inputTokens + r.outputTokens;
  }
  return days;
}

/** What changes when a job moves to another model, in plain words. */
export function consequences(job: Job, from: Model, to: Model): string[] {
  const lines: string[] = [];
  if (job === "embeddings") {
    lines.push(
      "Every file in the group's folders is indexed again with the new model. Until it finishes, search and grounded answers miss part of the folder.",
    );
  } else {
    lines.push(`New ${job === "chat" ? "conversations" : "summaries"} use ${to.name}.`);
  }
  if (to.where === "cloud" && from.where === "hub") {
    lines.push(
      `${job === "embeddings" ? "The text of every file" : "What people write"} will be sent to ${to.provider}, outside the office.`,
    );
  }
  if (to.where === "hub" && from.where === "cloud") {
    lines.push("Text stays in the office and costs nothing per use; answers may be slower.");
  }
  return lines;
}

// --- Mock usage: ~60 days for every device of the group, deterministic. ---

/** A stable number in [0, 1) for a seed string. */
function noise(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

/** Chat ran on the hub's Llama until the group switched to Claude Sonnet 20 days ago. */
const CHAT_SWITCH_DAYS_AGO = 20;

function mockUsage(now: Date): UsageRecord[] {
  const records: UsageRecord[] = [];
  for (const person of people) {
    for (const device of person.devices ?? []) {
      const phone = /iPhone|Android/.test(device.label);
      const joined = Math.floor((now.getTime() - device.addedAt.getTime()) / DAY);
      for (let ago = Math.min(joined, 59); ago >= 0; ago--) {
        const date = new Date(now.getTime() - ago * DAY);
        const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
        const seed = `${device.peerId}:${ago}`;
        const busy = (weekend ? 0.2 : 1) * (phone ? 0.3 : 1) * (0.4 + noise(seed));
        if (busy < 0.15) continue;
        const add = (modelId: string, requests: number, input: number, output: number) => {
          const n = Math.max(1, Math.round(requests * busy));
          records.push({
            day: dayOf(date),
            personId: person.id,
            peerId: device.peerId,
            modelId,
            requests: n,
            inputTokens: n * input,
            outputTokens: n * output,
          });
        };
        add(ago < CHAT_SWITCH_DAYS_AGO ? "claude-sonnet" : "llama-8b", 24, 2600, 420);
        add("claude-haiku", 6, 4200, 300);
        if (!phone) add("nomic-embed", 40, 900, 0);
      }
    }
  }
  return records;
}

export const usage: UsageRecord[] = mockUsage(today);
