import { z } from "zod";

/** A topic/outlier class as offered to the selection LLMs (no documents attached). */
const availableClassSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string().optional(),
});

// ── IntentDetection ──────────────────────────────────────────────────────────
export const intentDetectionInputSchema = z.object({
  question: z.string(),
  availableTopics: z.array(availableClassSchema),
  availableOutliers: z.array(availableClassSchema),
});
export const intentDetectionSchema = z
  .object({
    onCorpus: z
      .boolean()
      .describe(
        "Recall-first scope flag. True unless the prompt is not a retrieval request against this corpus at all. A prompt naming specific entities, facts, or relationships is on-corpus EVEN WHEN no topic class matches — downstream full-text + semantic search is the real gate, not the topic vocabulary.",
      ),
    offCorpusReason: z
      .string()
      .nullable()
      .describe(
        "When onCorpus is false, a one-line reason the prompt is not a retrieval request against this corpus; null otherwise.",
      ),
    subjects: z
      .array(
        z.object({
          prompt: z
            .string()
            .describe(
              "Standalone, vault-aligned reformulation of this subject as a natural-language statement — drives topic-class routing over the corpus index. Written in ENGLISH (the corpus language) regardless of the user's language. PRESERVE named entities and specific terms verbatim.",
            ),
          semanticQuery: z
            .string()
            .describe(
              "A HYPOTHETICAL ANSWER to this subject — a short factual passage (1–3 sentences) written as if it were an ideal corpus excerpt answering it, NOT a restatement of the question. Embedded for SEMANTIC (vector) retrieval: a fake answer lands nearer real answers than the bare question. Written in ENGLISH (the corpus language) regardless of the user's language. Invented specifics are embedding bait only. PRESERVE named entities verbatim.",
            ),
          ftsQueries: z
            .array(z.string())
            .min(1)
            .describe(
              "Distinctive KEYWORDS for full-text search — individual content terms and named entities from the subject, NOT phrases or sentences. List the salient terms (proper nouns, organisations, people, places, identifiers/codes, numbers, defining nouns), each as its OWN entry; a block matching more entries ranks higher. 1–6 entries; omit stop-words and filler. Written in ENGLISH (the corpus language) regardless of the user's language. Keep specific terms VERBATIM.",
            ),
        }),
      )
      .describe(
        "The distinct subjects the prompt decomposes into. Each carries a natural-language `prompt` (topic routing), a `semanticQuery` hypothetical answer (vector search), and `ftsQueries` keywords (full-text search). Use one subject for a single-subject prompt.",
      ),
    language: z
      .string()
      .describe(
        'The language the prompt is written in, as its English name (e.g. "English", "French", "Japanese") — the answer is written in it. Use "English" when the language cannot be determined.',
      ),
  })
  .describe(
    "On/off-corpus classification, subject decomposition, and request language. Does NOT answer the prompt.",
  );

// ── TopicSelect (per subject) ────────────────────────────────────────────────
export const topicSelectInputSchema = z.object({
  subject: z.string().describe("The subject being routed."),
  availableTopics: z.array(availableClassSchema),
  availableOutliers: z.array(availableClassSchema),
});
export const topicSelectSchema = z
  .object({
    topicKeys: z
      .array(z.string())
      .describe(
        "Topic-class key slugs (from availableTopics) plausibly relevant to the subject. Be exhaustive — prefer over-inclusion. MUST be drawn from the supplied keys.",
      ),
    outlierKeys: z
      .array(z.string())
      .describe(
        "Outlier-class key slugs (from availableOutliers) plausibly relevant to the subject. MUST be drawn from the supplied keys.",
      ),
  })
  .describe(
    "Selected topic + outlier class keys for one subject, drawn only from the supplied lists.",
  );

// ── TopicDescent (score one bounded batch of DAG nodes for a subject) ─────────
export const topicDescentInputSchema = z.object({
  subject: z.string().describe("The subject being routed."),
  nodes: z
    .array(
      z.object({
        key: z.string(),
        name: z.string(),
        description: z.string().optional(),
        kind: z.enum(["category", "topic"]).describe("category = grouping; topic = index leaf."),
        children: z
          .array(availableClassSchema)
          .describe("A category's direct child nodes; empty for an index topic (leaf)."),
      }),
    )
    .describe("The current descent frontier — a bounded batch of index nodes to score."),
});
export const topicDescentSchema = z
  .object({
    nodes: z
      .array(
        z.object({
          key: z.string().describe("A node key drawn verbatim from the supplied nodes."),
          relevance: z
            .number()
            .int()
            .min(0)
            .max(2)
            .describe("relevant = 2 / maybe = 1 / non-relevant = 0. Score-0 nodes are pruned."),
          descendKeys: z
            .array(z.string())
            .describe(
              "For a relevant CATEGORY, the child keys (verbatim) worth descending into; empty for an index topic or a category not worth descending.",
            ),
        }),
      )
      .describe("A relevance verdict for every supplied node."),
  })
  .describe("Per-node relevance scores and which children to descend. Selection only.");

// ── RollingSummarize (one doc-grouped batch of raw sections → per-section summaries) ──
export const rollingSummarizeInputSchema = z.object({
  /**
   * One XML payload: a `<question>` block (the user's prompt) followed by a `<sources>` block of
   * `<document>` entries — each with a `<document_summary>` and `<section ref="…">` blocks carrying
   * the section's `<context>` (ancestor TOC path), `<title>`, and raw `<content>`.
   */
  request: z.string(),
});
export const rollingSummarizeSchema = z.object({
  summaries: z
    .array(
      z.object({
        sectionRef: z
          .string()
          .describe("The section `ref` value, verbatim, this summary was extracted from."),
        summary: z
          .string()
          .describe(
            "All prompt-relevant information extracted from THIS section's raw content — the concrete specifics (full entity names, numbers, dates, relationships, conditions) needed downstream. It EXTRACTS; it does NOT answer the question.",
          ),
      }),
    )
    .describe(
      "One entry per RELEVANT section. Sections with nothing relevant to the question are OMITTED entirely (no entry, no ref).",
    ),
});

// ── Respond ──────────────────────────────────────────────────────────────────
export const composeInputSchema = z.object({
  question: z.string(),
  /** English name of the language the answer must be written in (the request's language). */
  language: z.string(),
  /** The grounded facts (each a single-document statement + its section citations) to compose from. */
  facts: z.array(
    z.object({
      statement: z.string(),
      citations: z.array(z.string()),
    }),
  ),
});
// Strict-compatible (OpenAI strict structured outputs): every field required, `missing` nullable.
// The answer is a list of CLAIMS, each carrying its own citations — grounding is structural: the
// model cannot emit a claim without a citations field.
export const composeSchema = z.object({
  claims: z
    .array(
      z.object({
        statement: z
          .string()
          .describe("One self-contained claim — a sentence or bullet; may include markdown."),
        citations: z
          .array(z.string())
          .describe(
            "The `[[/path#section]]` refs (verbatim from the summaries' refs) grounding THIS statement. At least one; omit the claim entirely if you cannot cite it.",
          ),
      }),
    )
    .describe("The answer as ordered, individually-grounded claims."),
  suggestions: z.array(z.string()),
  sufficient: z
    .boolean()
    .describe(
      "True if the summaries fully answer the prompt; false if key information is missing.",
    ),
  missing: z
    .string()
    .nullable()
    .describe(
      "When not sufficient, a short description of the information still needed; null otherwise.",
    ),
});
