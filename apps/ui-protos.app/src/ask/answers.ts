// Mock data for Ask: what the search over the user's folder returns, and the
// grounded answers written from it. Search entries follow the shape of
// `@statewalker/indexer-search` (SearchPipeline results); the UI never shows the
// scoring details, only the passages (file + section + quote).

/** One SearchPipeline result entry. */
export interface SearchEntry {
  blockId: string;
  path: string;
  score: number;
  citation?: { blockId: string; snippet: string; relevance: number; context?: string };
  explain?: {
    expandedQueries: { type: "lex" | "vec" | "hyde"; query: string }[];
    retrievalScore: number;
    rerankScore?: number;
    blendedScore: number;
  };
}

/** A cited passage, numbered as the answer cites it. */
export interface Source {
  n: number;
  blockId: string;
  /** "Clients/Dupont — offer.docx" */
  path: string;
  /** The section heading the passage sits under. */
  section: string;
  /** The quoted passage. */
  snippet: string;
}

/** One sentence of an answer: either backed by sources, or plainly unsupported. */
export type AnswerSegment = { text: string; cites: number[] } | { text: string; unsupported: true };

export interface GroundedAnswer {
  question: string;
  status: "answered" | "partial" | "not-found";
  segments: AnswerSegment[];
  sources: Source[];
  /** What the search looked for, in plain words. */
  searched: string[];
  followUps: string[];
}

/** A document as the preview shows it: blocks the passages point into. */
export interface DocumentBlock {
  blockId: string;
  heading?: string;
  text: string;
}

export const documents: Record<string, DocumentBlock[]> = {
  "Notes/meeting 2026-10-02.md": [
    {
      blockId: "m1",
      heading: "Meeting with Dupont",
      text: "2 October, at the house. Present: Mr and Mrs Dupont, Claire, Hugo.",
    },
    {
      blockId: "m2",
      text: "Mr Dupont agreed to start the works on Monday 2 November, once the kitchen is emptied.",
    },
    { blockId: "m3", text: "Mrs Dupont wants to keep the oak beams in the living room visible." },
    {
      blockId: "m4",
      heading: "Follow-ups",
      text: "- [ ] Send Dupont the revised phase 1 schedule\n- [ ] Ask Bois Lyonnais for the beam quote",
    },
  ],
  "Clients/Dupont — offer.docx": [
    {
      blockId: "o1",
      heading: "1. Scope",
      text: "Renovation of the kitchen and living room floor at 14 rue des Tanneurs, Lyon.",
    },
    {
      blockId: "o2",
      heading: "2. Materials",
      text: "Solid oak flooring, 22 mm, oiled finish. Beams supplied by Bois Lyonnais.",
    },
    {
      blockId: "o3",
      heading: "3. Schedule",
      text: "Phase 1 — removal of the old kitchen and floor: 2 weeks from the start of works.",
    },
    { blockId: "o4", text: "Phase 2 — floor laying and kitchen fitting: 4 weeks." },
    {
      blockId: "o5",
      heading: "4. Price",
      text: "Total: €18,400 excl. VAT, 30% due on signature, the balance on completion.",
    },
  ],
  "Clients/Dupont — notes.md": [
    {
      blockId: "n1",
      heading: "Dupont",
      text: "- [ ] Confirm the start date with Mr Dupont\n- [x] Visit the workshop",
    },
    { blockId: "n2", text: "Mr Dupont prefers calls after 6 pm." },
  ],
};

const blockText = (path: string, blockId: string) =>
  documents[path]?.find((b) => b.blockId === blockId)?.text ?? "";

const sectionOf = (path: string, blockId: string) => {
  let heading = "";
  for (const b of documents[path] ?? []) {
    if (b.heading) heading = b.heading;
    if (b.blockId === blockId) return heading;
  }
  return heading;
};

const entry = (path: string, blockId: string, score: number, queries: string[]): SearchEntry => ({
  blockId,
  path,
  score,
  citation: { blockId, snippet: blockText(path, blockId), relevance: score },
  explain: {
    expandedQueries: queries.map((query, i) => ({
      type: (["lex", "vec", "hyde"] as const)[i % 3] ?? "lex",
      query,
    })),
    retrievalScore: score,
    blendedScore: score,
  },
});

/** Search entries → numbered sources, in the order the answer cites them. */
export function toSources(entries: SearchEntry[]): Source[] {
  return entries.map((e, i) => ({
    n: i + 1,
    blockId: e.blockId,
    path: e.path,
    section: sectionOf(e.path, e.blockId),
    snippet: e.citation?.snippet ?? "",
  }));
}

/** The plain-words list of what was looked for. */
const searchedOf = (entries: SearchEntry[], fallback: string[]) => {
  const queries = entries[0]?.explain?.expandedQueries.map((q) => q.query) ?? fallback;
  return [...new Set(queries)];
};

const dupontQueries = ["Dupont start date", "when do the Dupont works begin", "Dupont schedule"];
const dupontEntries = [
  entry("Notes/meeting 2026-10-02.md", "m2", 0.91, dupontQueries),
  entry("Clients/Dupont — offer.docx", "o3", 0.84, dupontQueries),
  entry("Clients/Dupont — notes.md", "n1", 0.77, dupontQueries),
];

export const dupontStart: GroundedAnswer = {
  question: "When does the Dupont job start?",
  status: "answered",
  segments: [
    { text: "The Dupont job starts on Monday 2 November.", cites: [1] },
    {
      text: "Phase 1, removing the old kitchen and floor, takes two weeks from that day.",
      cites: [2],
    },
    {
      text: "The date is not final yet: confirming it with Mr Dupont is still open in your notes.",
      cites: [3],
    },
  ],
  sources: toSources(dupontEntries),
  searched: searchedOf(dupontEntries, []),
  followUps: [
    "What does phase 1 include?",
    "Who supplies the beams?",
    "What is the Dupont budget?",
  ],
};

const leroyQueries = [
  "Leroy roof timber price",
  "Leroy timber invoice",
  "cost of roof beams for Leroy",
];

export const leroyTimber: GroundedAnswer = {
  question: "How much did we pay for the Leroy roof timber?",
  status: "not-found",
  segments: [],
  sources: [],
  searched: leroyQueries,
  followUps: ["What is in the Leroy brief?", "Which invoices do we have?"],
};

const budgetQueries = ["Dupont budget", "Dupont site foreman", "Dupont total price"];
const budgetEntries = [entry("Clients/Dupont — offer.docx", "o5", 0.88, budgetQueries)];

export const dupontBudget: GroundedAnswer = {
  question: "What is the Dupont budget, and who is the site foreman?",
  status: "partial",
  segments: [
    { text: "The Dupont offer totals €18,400 excl. VAT, 30% due on signature.", cites: [1] },
    { text: "I didn't find who the site foreman is in your files.", unsupported: true },
  ],
  sources: toSources(budgetEntries),
  searched: searchedOf(budgetEntries, budgetQueries),
  followUps: ["When does the Dupont job start?", "Who worked on the Dupont visit?"],
};

export const answers = [dupontStart, dupontBudget, leroyTimber];

/**
 * The scripted search: a question finds the mock answer it is closest to; anything
 * else is honestly not found.
 */
export function findAnswer(question: string): GroundedAnswer {
  const q = question.toLowerCase();
  if (q.includes("dupont") && /budget|price|cost|foreman/.test(q)) return dupontBudget;
  if (q.includes("dupont")) return dupontStart;
  if (q.includes("leroy")) return leroyTimber;
  return {
    question,
    status: "not-found",
    segments: [],
    sources: [],
    searched: [question],
    followUps: ["When does the Dupont job start?"],
  };
}

/**
 * The answer as the assistant writes it in chat: each sentence followed by its
 * citation markers, so the text and the source cards use the same numbers.
 */
export function answerText(answer: GroundedAnswer): string {
  if (answer.status === "not-found")
    return "I didn't find this in your files. You could rephrase the question, or check that the folder holding this information is indexed.";
  return answer.segments
    .map((s) => ("cites" in s ? `${s.text} ${s.cites.map((n) => `[${n}]`).join("")}` : s.text))
    .join(" ");
}
