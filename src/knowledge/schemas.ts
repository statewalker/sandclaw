import { z } from "zod";

// ── Summarizer ──────────────────────────────────────────────────────────────

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
        "Pure narrative summary of this section, NEVER verbatim raw text. Entity-rich: name the main entities and their relations needed to reproduce the section's ideas (persons, organisations, places, dates/periods, products, headline figures). Describe dense numeric blocks/tables AS A WHOLE — the objects the rows stand for, the characteristics the columns capture with their value nature/unit, and a one-line reading of what the block shows — never transcribing cells.",
      ),
  })
  .describe("One L2 section: a navigation aid spanning a contiguous range of raw lines.");

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

// ── Meta (topics + outliers) ─────────────────────────────────────────────────
// Lenient on purpose: no `.min(1)` on fields, and the top-level arrays default to
// empty. Non-strict generation occasionally emits an off-shape declaration (a
// blank field, an omitted `outliers` array); a `.min(1)` would make the WHOLE
// document parse throw and drop the source. Shape is enforced deterministically
// afterwards by `normalizeMeta` (drops blank-key / unjustified declarations),
// matching how the graph extractor handles off-shape triples.

export const documentTopicSchema = z
  .object({
    key: z
      .string()
      .describe(
        "Generic class slug (kebab-case). For an existing class, reuse its slug verbatim. NEVER instance-specific (use 'company-founders', not 'acme-founders').",
      ),
    name: z.string().describe("Generic class name. NEVER instance-specific."),
    description: z
      .string()
      .describe(
        "ABSTRACT one-line definition of the class, document-independent. When reusing an existing class, COPY its description verbatim.",
      ),
    sectionKeys: z
      .array(z.string())
      .describe("Section keys (from the summary) where this class is covered."),
    brief: z
      .string()
      .describe("Per-source-per-class brief — what THIS source specifically contributes."),
  })
  .describe("Per-document topic-class declaration.");

export const documentOutlierSchema = z
  .object({
    key: z.string().describe("Outlier class slug (kebab-case, generic)."),
    name: z.string().describe("Outlier class name. Generic."),
    description: z
      .string()
      .describe("ABSTRACT one-line definition of the outlier class. Copy verbatim when reusing."),
    globalClass: z
      .string()
      .optional()
      .describe("Optional global outlier-class slug when the per-doc key differs."),
    sectionKeys: z.array(z.string()).describe("Section keys where the finding surfaces."),
    brief: z.string().describe("Per-source brief of the surprising finding."),
    whySurprising: z
      .string()
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

export const metaExtractorInputSchema = z
  .object({
    uri: z.string().describe("Document URI — project-relative path including extension."),
    summary: documentSummarySchema.describe(
      "The L2 summary the declarations point at via sectionKeys.",
    ),
    existingClasses: z
      .array(existingClassSchema)
      .describe("Already-coined classes across the corpus. Reuse keys; copy descriptions."),
  })
  .describe("Input to the meta extraction call. Returns DocumentMeta.");

// ── Graph (entities + statements + relations) ────────────────────────────────

export const entitySchema = z
  .object({
    value: z
      .string()
      .min(1)
      .describe("Canonical entity name. Stable across sections / re-ingests."),
    type: z
      .string()
      .optional()
      .describe("Open lowercase enum: person, organisation, place, paper, tool, dataset, …"),
  })
  .describe("An actor / method / dataset / concept the section is about.");

// Lenient on purpose: no `.length(3)` / element `.min(1)` constraints. With
// `strictJsonSchema: false` the schema is NOT enforced during generation, so a
// single off-shape triple (missing field, 2- or 4-element array) would make the
// WHOLE-document parse throw and drop the document. Triple shape is enforced
// deterministically afterwards (see `filterUnknownSubjects`), matching how
// unknown subjects are already handled.
const tripleArraySchema = z
  .array(z.string())
  .describe(
    "[subject, predicate, object] triple — exactly three non-empty strings. Subject (index 0) MUST be an entity.value declared in this document's graph. Off-shape triples are dropped by the runtime filter.",
  );

export const statementSchema = tripleArraySchema.describe(
  "Entity-attribute fact: subject is an entity.value, object is a stringified literal.",
);
export const relationSchema = tripleArraySchema.describe(
  "Entity-to-entity fact: both subject and object are entity.value strings.",
);

export const sectionGraphSchema = z
  .object({
    sectionKey: z
      .string()
      .min(1)
      .describe("Section key — matches a DocumentSummary.sections[].key."),
    entities: z.array(entitySchema).describe("Entities introduced or referenced by this section."),
    statements: z.array(statementSchema).describe("Entity-to-literal findings/conclusions."),
    relations: z.array(relationSchema).describe("Entity-to-entity structural facts."),
  })
  .describe("Structured signal for one section of the document.");

export const documentGraphSchema = z
  .object({
    sections: z
      .array(sectionGraphSchema)
      .describe("One graph per L2 section, in the same order as the summary's sections."),
  })
  .describe("Per-document structured-signal layer.");

export const graphExtractorInputSchema = z
  .object({
    uri: z.string().describe("Document URI — project-relative path including extension."),
    sections: z
      .array(sectionSummarySchema)
      .describe(
        "Sections of the document — output sectionKey values must match these section.key values.",
      ),
  })
  .describe("Input to the per-section graph extraction call. Returns DocumentGraph.");

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
export type DocumentGraphOutput = z.infer<typeof documentGraphSchema>;
export type AttributeActions = z.infer<typeof attributeActionsSchema>;
export type AttributeAction = AttributeActions["actions"][number];
export type AttributeInput = z.infer<typeof attributeInputSchema>;
export type SplitCategoryOutput = z.infer<typeof splitCategoryOutputSchema>;
export type RefineTopicOutput = z.infer<typeof refineTopicOutputSchema>;
export type MergeOutput = z.infer<typeof mergeOutputSchema>;
export type NameCategoryOutput = z.infer<typeof nameCategoryOutputSchema>;
