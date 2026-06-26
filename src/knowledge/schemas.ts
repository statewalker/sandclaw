import { z } from "zod";

// ── Summarizer ──────────────────────────────────────────────────────────────

export const detailTableSchema = z
  .object({
    caption: z
      .string()
      .min(1)
      .describe(
        "Self-describing caption naming what the table holds (the objects its rows stand for).",
      ),
    columns: z
      .array(z.string())
      .min(1)
      .describe(
        "Column headers — include the unit where it is uniform for the column (e.g. 'Duration (ms)').",
      ),
    rows: z
      .array(z.array(z.string()))
      .describe(
        "Rows; each row has one string cell per column, in column order. Numbers/dates are stringified.",
      ),
  })
  .describe(
    "A structured table of repetitive facts (a source table or an enumeration of the same attributes across objects).",
  );

export const sectionSummarySchema = z
  .object({
    key: z
      .string()
      .min(1)
      .describe(
        "Kebab-case slug (ASCII alphanumeric plus '-') derived from the section title. Stable across re-ingests: prefer reusing a prior key when the section is semantically equivalent.",
      ),
    title: z
      .string()
      .describe(
        "Human-readable section heading drawn from the source (or paraphrased when the source has no explicit heading).",
      ),
    startLine: z
      .number()
      .int()
      .nonnegative()
      .describe("0-indexed inclusive line number in the raw text where this section begins."),
    endLine: z
      .number()
      .int()
      .nonnegative()
      .describe("0-indexed inclusive line number in the raw text where this section ends."),
    summary: z
      .string()
      .describe(
        "Summary stating the section's MAIN FACTS in prose (1–4 sentences): the key entities, findings, figures, and what the section establishes — enough to judge relevance, NOT exhaustive. NEVER verbatim raw. Do NOT transcribe tables or list every number; instead, when the section holds table-like data or images, note their presence via the flags below.",
      ),
    hasTables: z
      .boolean()
      .optional()
      .describe(
        "True when the section's content contains table-like / structured tabular data (a source table or an enumeration of the same attributes across objects).",
      ),
    tableHints: z
      .string()
      .optional()
      .describe(
        "Short description of what that tabular data is about. Only when hasTables is true.",
      ),
    hasImages: z
      .boolean()
      .optional()
      .describe("True when the section contains images, figures, or charts."),
    imageHints: z
      .string()
      .optional()
      .describe("Short description of what those images depict. Only when hasImages is true."),
  })
  .describe(
    "One leaf section: title, raw line range, a fact-stating summary, and flags for table-like / image content.",
  );

export const documentSummarySchema = z
  .object({
    title: z
      .string()
      .describe(
        "Natural document title — use the source's explicit title when present, otherwise a concise descriptive title.",
      ),
    summary: z
      .string()
      .describe("Document-level abstract — 1–3 sentences concatenating the section themes."),
    sections: z
      .array(sectionSummarySchema)
      .min(1)
      .describe(
        "Ordered list of L2 sections covering the full document. Normal documents have 3–15 sections; tiny snippets may have 1. NEVER 30+.",
      ),
  })
  .describe("L2 narrative summary of a single source.");

const rawLineSchema = z
  .tuple([
    z.number().int().nonnegative().describe("0-indexed line number in the raw text."),
    z.string().describe("Verbatim line content."),
  ])
  .describe("One raw line as a [lineNumber, text] pair.");

export const summarizerInputSchema = z
  .object({
    uri: z.string().describe("Document URI — project-relative path including extension."),
    rawLines: z
      .array(rawLineSchema)
      .describe(
        "This BLOCK of the document's raw text as numbered lines (absolute line numbers). Section ranges reference these numbers.",
      ),
    previousSection: z
      .string()
      .optional()
      .describe(
        "Summary of the last section already finalized before this block (rolling context); absent for the first block.",
      ),
  })
  .describe(
    "Summarizer input: one block of a document's numbered raw lines, plus rolling context.",
  );

// ── Chapter aggregation (sections → chapters → super-chapters) ────────────────
export const aggregateChaptersInputSchema = z
  .object({
    members: z
      .array(
        z.object({
          key: z.string().describe("A section or sub-chapter key, verbatim."),
          title: z.string(),
          summary: z.string(),
        }),
      )
      .describe("Consecutive sections or sub-chapters, in document order, to group into chapters."),
  })
  .describe("Input to a chapter-aggregation round.");

export const aggregateChaptersSchema = z
  .object({
    chapters: z
      .array(
        z.object({
          title: z.string().describe("Chapter title — the theme of its members."),
          summary: z
            .string()
            .describe("1–2 sentence chapter summary, synthesised from its members' summaries."),
          memberKeys: z
            .array(z.string())
            .min(1)
            .describe(
              "The member keys (verbatim) this chapter groups — a contiguous run in document order.",
            ),
        }),
      )
      .describe(
        "Chapters grouping ALL supplied members into coherent, contiguous runs (every member in exactly one chapter).",
      ),
  })
  .describe("One chapter-aggregation round: a coherent grouping of the supplied members.");

// ── Deferred table extraction (per flagged leaf section) ─────────────────────

export const tableExtractInputSchema = z
  .object({
    title: z.string().describe("Section title."),
    summary: z.string().describe("Section summary (it notes the tabular data present)."),
    hint: z.string().optional().describe("What the tabular data is about, when known."),
    content: z
      .string()
      .describe("The section's raw text content to extract structured tables from."),
  })
  .describe("Input to deferred table extraction for one flagged section.");

export const tableExtractSchema = z
  .object({
    tables: z
      .array(detailTableSchema)
      .default([])
      .describe(
        "All structured tables present in the section's content, each as { caption, columns, rows }. Empty when none can be reliably extracted.",
      ),
  })
  .describe("Structured tables extracted from one section's raw content.");

// ── Meta (topics + outliers) ─────────────────────────────────────────────────
// Lenient on purpose: EVERY field is `.optional()` (no `.min(1)` either), and the
// top-level arrays default to empty. With `strictJsonSchema: false` the schema is
// not enforced during generation, so a model routinely emits an off-shape
// declaration (a blank or omitted field — `brief` is the common one). A required
// field would make the WHOLE document parse throw and drop the source. Shape is
// enforced deterministically afterwards by `normalizeMeta` (drops blank-key /
// unjustified declarations, defaults the rest), matching how the graph extractor
// handles off-shape triples.

export const documentTopicSchema = z
  .object({
    key: z
      .string()
      .optional()
      .describe(
        "Generic class slug (kebab-case). For an existing class, reuse its slug verbatim. NEVER instance-specific (use 'company-founders', not 'acme-founders').",
      ),
    name: z.string().optional().describe("Generic class name. NEVER instance-specific."),
    description: z
      .string()
      .optional()
      .describe(
        "ABSTRACT one-line definition of the class, document-independent. When reusing an existing class, COPY its description verbatim.",
      ),
    sectionKeys: z
      .array(z.string())
      .optional()
      .describe("Section keys (from the summary) where this class is covered."),
    brief: z
      .string()
      .optional()
      .describe("Per-source-per-class brief — what THIS source specifically contributes."),
  })
  .describe("Per-document topic-class declaration.");

export const documentOutlierSchema = z
  .object({
    key: z.string().optional().describe("Outlier class slug (kebab-case, generic)."),
    name: z.string().optional().describe("Outlier class name. Generic."),
    description: z
      .string()
      .optional()
      .describe("ABSTRACT one-line definition of the outlier class. Copy verbatim when reusing."),
    globalClass: z
      .string()
      .optional()
      .describe("Optional global outlier-class slug when the per-doc key differs."),
    sectionKeys: z
      .array(z.string())
      .optional()
      .describe("Section keys where the finding surfaces."),
    brief: z.string().optional().describe("Per-source brief of the surprising finding."),
    whySurprising: z
      .string()
      .optional()
      .describe("One sentence explaining what expectation the finding violates. REQUIRED."),
  })
  .describe("Per-document outlier-class declaration; only when the source itself flags surprise.");

export const documentMetaSchema = z
  .object({
    topics: z
      .array(documentTopicSchema)
      .default([])
      .describe("Topic classes covered. Max ~6 per source; most cover 2–4. Empty array is fine."),
    outliers: z
      .array(documentOutlierSchema)
      .default([])
      .describe("Source-flagged surprises. Empty when nothing is flagged surprising."),
  })
  .describe("L2.5 forward-declaration layer for a single source.");

export const existingClassSchema = z
  .object({
    kind: z.enum(["topic", "outlier"]),
    key: z.string(),
    name: z.string(),
    description: z.string(),
  })
  .describe("An already-coined class. Reuse its key verbatim; copy its description when reusing.");

// The routing payload (title + summary, per leaf section): what meta reads.
const metaSummarySchema = z
  .object({
    title: z.string(),
    summary: z.string(),
    sections: z.array(
      z.object({
        key: z.string(),
        title: z.string(),
        summary: z.string(),
      }),
    ),
  })
  .describe(
    "The L2 summary as the routing payload — document title + summary + per-leaf title + summary.",
  );

export const metaExtractorInputSchema = z
  .object({
    uri: z.string().describe("Document URI — project-relative path including extension."),
    summary: metaSummarySchema.describe(
      "The L2 summary the declarations point at via sectionKeys.",
    ),
    existingClasses: z
      .array(existingClassSchema)
      .describe("Already-coined classes across the corpus. Reuse keys; copy descriptions."),
  })
  .describe("Input to the meta extraction call. Returns DocumentMeta.");

// ── Attribution (place document topics onto the index DAG) ───────────────────
// Candidates and index nodes are addressed by `key`: actions name the candidate
// and node keys they cover and the runtime reattaches each candidate's document
// references locally, so the (potentially large) per-doc URI lists never travel
// through the LLM call. The LLM sees only an embedding-bounded option set, never
// the whole index.

const nodeRefSchema = z
  .object({
    key: z.string().describe("Index-node key slug."),
    name: z.string(),
    description: z.string(),
    kind: z.enum(["category", "topic"]).describe("category = grouping; topic = index leaf."),
  })
  .describe("One candidate index node the LLM may attach to or nest under.");

const attributeCandidateSchema = z
  .object({
    key: z.string().describe("Document-topic candidate key slug (not necessarily in the index)."),
    name: z.string(),
    description: z.string().describe("Abstract one-line definition (may be empty)."),
  })
  .describe("One per-document topic group to place onto the index.");

export const attributeInputSchema = z
  .object({
    candidates: z
      .array(attributeCandidateSchema)
      .describe("Per-document topic groups to place. Decide exactly one action per candidate."),
    options: z
      .array(nodeRefSchema)
      .describe(
        "Embedding-nearest index nodes proposed as attach/nest targets. May be empty (coin new).",
      ),
  })
  .describe("Input to the attribution round. Returns AttributeActions.");

export const attributeActionSchema = z
  .discriminatedUnion("kind", [
    z
      .object({
        kind: z.literal("attach"),
        candidateKey: z.string().min(1).describe("The candidate this action covers."),
        nodeKeys: z
          .array(z.string().min(1))
          .min(1)
          .describe(
            "Existing index-TOPIC key(s) the candidate means the same class as. List several when the candidate genuinely spans multiple index topics.",
          ),
      })
      .describe(
        "The candidate matches one or more existing index topics. Prefer this over coining.",
      ),
    z
      .object({
        kind: z.literal("coin"),
        candidateKey: z.string().min(1).describe("The candidate this action covers."),
        name: z
          .string()
          .min(1)
          .describe("Generic, reusable index-topic name. NEVER instance-specific."),
        description: z
          .string()
          .min(1)
          .describe("One-line generic description for the new index topic."),
        parentKey: z
          .string()
          .optional()
          .describe(
            "Optional CATEGORY key to nest the new index topic under (descend into the best-fitting category). Omit to place at the root.",
          ),
      })
      .describe("The candidate fits no existing index topic — coin a new one. Last resort."),
  ])
  .describe("One attribution decision for a document-topic candidate.");

export const attributeActionsSchema = z
  .object({
    actions: z
      .array(attributeActionSchema)
      .describe("One action per candidate. May be empty (runtime coins a fallback for each)."),
  })
  .describe("Output of the attribution round; drives mechanical updates to the index DAG.");

// ── Category fan-out split (a category with > B children) ─────────────────────

export const splitCategoryInputSchema = z
  .object({
    category: nodeRefSchema.describe("The over-capacity category to split."),
    children: z
      .array(nodeRefSchema)
      .describe("Its direct children, to partition into sub-categories."),
  })
  .describe("Input to a category fan-out split. Returns SplitCategoryOutput.");

export const splitCategoryOutputSchema = z
  .object({
    subcategories: z
      .array(
        z.object({
          name: z.string().min(1).describe("Generic sub-category name."),
          description: z.string().min(1).describe("One-line sub-category description."),
          childKeys: z
            .array(z.string().min(1))
            .min(1)
            .describe("Keys of the parent's children grouped under this sub-category."),
        }),
      )
      .describe(
        "Sub-categories partitioning the children. Empty array = decline (no honest grouping).",
      ),
  })
  .describe("Output of a category fan-out split.");

// ── Index-topic refinement (a leaf with > R references) ──────────────────────
// References are presented URI-free as members with synthetic `id`s; the runtime
// maps the chosen ids back to document reference URIs.

export const refineTopicInputSchema = z
  .object({
    topic: nodeRefSchema.describe("The over-capacity index topic to refine."),
    members: z
      .array(
        z.object({
          id: z.string().describe("Synthetic member id (maps back to a reference)."),
          name: z.string().describe("Contributing document topic's name."),
          brief: z.string().describe("Contributing document topic's brief (may be empty)."),
        }),
      )
      .describe("The leaf's references as members, to cluster into sub-themes."),
  })
  .describe("Input to an index-topic refinement. Returns RefineTopicOutput.");

export const refineTopicOutputSchema = z
  .object({
    subthemes: z
      .array(
        z.object({
          name: z.string().min(1).describe("Generic sub-theme (child index-topic) name."),
          description: z.string().min(1).describe("One-line sub-theme description."),
          memberIds: z
            .array(z.string().min(1))
            .min(1)
            .describe("Member ids partitioned into this sub-theme."),
        }),
      )
      .describe(
        "Sub-themes partitioning the members. Empty array = decline (no honest sub-themes).",
      ),
  })
  .describe("Output of an index-topic refinement.");

// ── Cleanup merge (a small NN cluster of near-duplicate index topics) ────────

export const mergeClusterInputSchema = z
  .object({
    cluster: z
      .array(nodeRefSchema)
      .min(2)
      .describe("A small vector-nearest-neighbour cluster of possibly-duplicate index topics."),
  })
  .describe("Input to a cleanup merge adjudication. Returns MergeOutput.");

export const mergeOutputSchema = z
  .object({
    merges: z
      .array(
        z.object({
          canonicalKey: z.string().min(1).describe("Surviving index-topic key from the cluster."),
          name: z.string().min(1).describe("Canonical name for the merged index topic."),
          description: z.string().min(1).describe("Canonical one-line description."),
          absorbedKeys: z
            .array(z.string().min(1))
            .min(1)
            .describe("Other cluster keys folded into the canonical one (recorded as aliases)."),
        }),
      )
      .describe(
        "Merges to apply. Empty array = the cluster holds distinct classes; merge nothing.",
      ),
  })
  .describe("Output of a cleanup merge adjudication.");

// ── Recluster (name a category over a bounded cluster of index topics) ────────

export const nameCategoryInputSchema = z
  .object({
    topics: z
      .array(nodeRefSchema)
      .min(1)
      .describe("A bounded cluster of index topics to group under one named category."),
  })
  .describe("Input to a recluster category-naming call. Returns NameCategoryOutput.");

export const nameCategoryOutputSchema = z
  .object({
    name: z.string().min(1).describe("Generic category name covering the cluster."),
    description: z.string().min(1).describe("One-line category description."),
  })
  .describe("Output of a recluster category-naming call.");

export type DocumentSummaryOutput = z.infer<typeof documentSummarySchema>;
export type SummarizerInput = z.infer<typeof summarizerInputSchema>;
export type DocumentMetaOutput = z.infer<typeof documentMetaSchema>;
export type AttributeActions = z.infer<typeof attributeActionsSchema>;
export type AttributeAction = AttributeActions["actions"][number];
export type AttributeInput = z.infer<typeof attributeInputSchema>;
export type SplitCategoryOutput = z.infer<typeof splitCategoryOutputSchema>;
export type RefineTopicOutput = z.infer<typeof refineTopicOutputSchema>;
export type MergeOutput = z.infer<typeof mergeOutputSchema>;
export type NameCategoryOutput = z.infer<typeof nameCategoryOutputSchema>;
