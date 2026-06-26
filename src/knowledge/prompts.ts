const CORPUS_PURPOSE_PLACEHOLDER = "{{corpus_purpose}}";
const DEFAULT_CORPUS_PURPOSE =
  "a general-purpose knowledge base; summarise faithfully at a uniform level of detail.";

/** Substitute the corpus-purpose placeholder in a system prompt. */
export function fillCorpusPurpose(prompt: string, corpusPurpose?: string): string {
  const purpose =
    corpusPurpose && corpusPurpose.trim().length > 0 ? corpusPurpose : DEFAULT_CORPUS_PURPOSE;
  return prompt.split(CORPUS_PURPOSE_PLACEHOLDER).join(purpose);
}

/** L2 summarizer prompt: sections a block and, for each section, emits a
 * fact-stating summary plus flags for table-like / image content. Cheap pass —
 * exhaustive facts are NOT distilled here; the raw text is the fact source downstream,
 * and structured tables are extracted later in a deferred stage. */
export const SUMMARIZER_SYSTEM_PROMPT = `You are the L2 summarizer for an LLM-curated wiki.

Your job: section a raw text source and, for EACH section, produce a 'summary' that
states the section's MAIN FACTS, plus flags noting whether the section holds table-like
data or images. You do NOT transcribe tables and you do NOT produce an exhaustive
fact dump — the raw text remains the fact source for later stages.

SECTIONING:

1. Section count: 3–15 in normal cases; 1 for a tiny snippet; NEVER 30+ (aggregate
   fine-grained subtopics under one heading).
2. Each section MUST carry a kebab-case 'key' (ASCII alphanumeric + dashes) derived
   from its title; on re-ingest prefer reusing a prior key for a semantically
   equivalent section rather than renaming cosmetically.
3. Each section MUST carry a [startLine .. endLine] range over the raw text it covers
   (0-indexed, inclusive; ranges may overlap slightly when raw lacks clean breaks).
4. The document 'title' is the source's natural title (explicit title from raw, else a
   concise descriptive one). The document 'summary' is a 1–3 sentence abstract — the
   concatenation of section themes, not an independent claim.

'summary' (states the section's main facts — the routing tier):

5. 1–4 sentences capturing what the section establishes and its salient facts — the
   central entities, the headline findings, the few figures that matter most, the "so
   what". Enough that a reader can judge relevance and know what is here; NOT exhaustive
   — do not attempt to list every entity, date, or number (the raw text holds those).
6. NO introductory framing ("This section describes…"). Open directly with content.
   NEVER quote raw verbatim and NEVER transcribe a table into the summary.

TABLE / IMAGE FLAGS (presence only — never the contents):

7. Set 'hasTables' true when the section's content contains table-like / structured
   tabular data: a source table, or an enumeration of the SAME attributes across
   several objects (e.g. repeated measurements across samples, the same fields listed
   for many items). When true, give a short 'tableHints' naming what that tabular data
   is about (e.g. "measurements per sample over time"). Omit both when there is no
   tabular data.
8. Set 'hasImages' true when the section contains images, figures, or charts, with a
   short 'imageHints' describing what they depict. Omit both when there are none.
9. The flags are PRESENCE signals only — they drive a later structured-extraction
   stage. Do NOT put table rows or image data into the summary.

corpus purpose (steers level of detail per section): ${CORPUS_PURPOSE_PLACEHOLDER}

On-corpus sections get a fuller summary; off-corpus or tangential ones get a one-liner.

BLOCKS: you may receive only a BLOCK of a longer document — a contiguous slice of
numbered lines, not necessarily the whole source. Section the lines you are given,
using their ABSOLUTE line numbers in [startLine, endLine]. When 'previousSection' is
supplied, it summarises the section immediately before this block — use it for
continuity, but do NOT re-output it. The final block's last section may run to the
document end; an interior block's trailing lines may be re-summarised in a later block.`;

/** Deferred table-extraction prompt: extract structured tables from one section's raw content. */
export const TABLE_EXTRACT_SYSTEM_PROMPT = `You extract STRUCTURED TABLES from one section
of a document, given its title, summary, and raw text content.

Return every table-like dataset present in the content as { caption, columns, rows }:
- 'caption': a self-describing name for what the table holds (the objects its rows stand for).
- 'columns': column headers, including the unit where uniform (e.g. "Duration (ms)").
- 'rows': one string cell per column, in column order; stringify numbers and dates.

RULES:
1. Include source tables AND enumerations of the SAME attributes across several objects
   (e.g. repeated measurements across samples, the same fields listed for many items).
   There is NO row limit — transcribe.
2. A one-off fact about a single object is NOT a table; only emit a table when ≥2 rows
   share the columns.
3. Reconstruct tables faithfully from the raw text even when the layout is messy
   (e.g. extracted PDF). Do not invent values not present in the content.
4. Return an EMPTY 'tables' array when no reliable structured table is present.`;

/** Document-outline chapter aggregation prompt: group consecutive members into chapters. */
export const AGGREGATE_CHAPTERS_SYSTEM_PROMPT = `You organise a document's parts into a
clean outline. You receive an ordered list of MEMBERS — either sections or already-formed
sub-chapters — each with a key, title, and summary. Group them into CHAPTERS: each chapter
is a semantically coherent, CONTIGUOUS run of members (never reorder; never split a member).

RULES — load-bearing:
1. Every member MUST belong to exactly one chapter; chapters partition the members in order.
2. 'memberCount' is how many of the remaining members (in the given order) the chapter consumes.
   The counts apply left-to-right: chapter 1 takes the first 'memberCount' members, chapter 2 the
   next, and so on until every member is consumed. You only choose where the cuts fall — never
   reorder or split a member, and make the counts sum to the total number of members.
3. 'summary' is a 1–2 sentence synthesis of the chapter's members — not a list of them.
4. Aim for a handful of chapters; group finely-related members together rather than making
   one chapter per member.

corpus purpose (frames coherence): ${CORPUS_PURPOSE_PLACEHOLDER}`;

/** Topic + outlier class extraction prompt (lifted from wiki-runtime). */
export const META_EXTRACTOR_SYSTEM_PROMPT = `You are the topic + outlier
classifier for an LLM-curated wiki. Read a document's L2 summary and decide
which generic TOPIC CLASSES and which generic OUTLIER CLASSES it covers, plus
per-source briefs that will be lifted verbatim into the global class pages.

RULES — these are load-bearing:

CLASS NAMING

1. Generic class names ONLY. Prefer "Company founders" over "Acme founders".
   The specific identity lives in the document body and the per-section graph —
   NEVER as the class name itself.
2. Prefer reusing existing classes. Before coining a new class, scan the
   provided existing-classes list for a match and use it verbatim (same 'key',
   same 'name'). Don't coin near-duplicates.
3. The class 'key' is kebab-case ASCII alphanumeric plus '-', derived from the
   class name. For existing classes, reuse the existing key exactly.
4. Maximum ~6 topic classes per source. Most sources cover 2–4.

TWO LAYERS OF TEXT — 'description' AND 'brief' — BOTH ALWAYS REQUIRED

5. 'description' is ABSTRACT, generic, document-INDEPENDENT — it defines what
   the class MEANS. No proper nouns or numbers from this document.
6. 'brief' is DOCUMENT-SPECIFIC — 1–4 sentences on what THIS source contributes
   (angle, headline data points, which sections cover it).
7. REUSING an existing class — COPY its 'description' verbatim; write a fresh
   'brief'. A divergent description on a reuse creates a global-index inconsistency.
8. COINING a new class — write a fresh abstract 'description' future sources can reuse.

SECTION KEYS

9. Every entry MUST list at least one 'sectionKeys' value present in the summary.

OUTLIERS

10. Mark a finding as an outlier ONLY when the source itself flags it as surprising.
11. Every outlier MUST carry 'whySurprising'. If you cannot articulate a violated
    expectation, it is NOT an outlier.
12. Outliers can ALSO be topics — declare in both sections when applicable.
13. NO fabricated outliers.

corpus purpose (frames what counts as on-corpus): ${CORPUS_PURPOSE_PLACEHOLDER}`;

/** Attribution prompt: place per-document topic candidates onto the index DAG. */
export const ATTRIBUTION_SYSTEM_PROMPT = `You place per-document topic
forward-declarations onto a global topic index organised as a hierarchy of
CATEGORIES (groupings) over INDEX TOPICS (leaves that aggregate document
references).

You receive CANDIDATE topic groups (each a stable 'key' + name + description that
the mechanical key/alias match did NOT already absorb) and a small set of OPTION
nodes — the embedding-nearest existing index nodes. You decide purely from names +
descriptions; the runtime reattaches each candidate's document references by key.
Decide ONE action per candidate, naming it in 'candidateKey':

- attach — the candidate means the same class as one (or several) existing INDEX
  TOPICS. List their key(s) in 'nodeKeys'. List several only when the candidate
  genuinely spans multiple classes.
- coin — the candidate fits no existing index topic. Coin a new one with a
  GENERIC, reusable 'name' and one-line 'description'. Optionally set 'parentKey'
  to an existing CATEGORY option to nest it where it belongs. This is the last resort.

RULES — these are load-bearing:

1. Be conservative. Prefer attach over coin whenever meanings overlap. Treat
   near-duplicates ("User authentication" vs "User auth") as the SAME class and attach.
2. Only ever 'attach' to options whose kind is "topic" (an index topic). To place
   under a grouping, 'coin' with that category's key as 'parentKey'.
3. Generic names ONLY. "Company founders", not "Acme founders".
4. EVERY candidate MUST be covered by exactly one action. The runtime coins a
   fallback index topic for any candidate you leave unplaced, so make that
   recovery unnecessary.

corpus purpose (frames what counts as the same class): ${CORPUS_PURPOSE_PLACEHOLDER}`;

/** Category fan-out split prompt: partition an over-large category's children. */
export const SPLIT_CATEGORY_SYSTEM_PROMPT = `You refine a global topic index. A
CATEGORY has accumulated too many direct children. Partition its children into a
few coherent SUB-CATEGORIES so the category's direct fan-out drops.

You receive the category and its children (each key + name + description). Return
sub-categories, each with a GENERIC name, a one-line description, and the keys of
the children it groups. Every child key you list MUST be one of the supplied
children. Leave a child out to keep it directly under the parent.

This is HEURISTIC, not mandatory: if the children do NOT fall into honest
sub-groupings, return an EMPTY list and the category is left as-is. Never
fabricate groupings just to reduce fan-out.

corpus purpose (frames natural groupings): ${CORPUS_PURPOSE_PLACEHOLDER}`;

/** Index-topic refinement prompt: split an over-large leaf into sub-themes. */
export const REFINE_TOPIC_SYSTEM_PROMPT = `You refine a global topic index. An
INDEX TOPIC has accumulated too many document references and has become coarse.
Cluster its member references into finer SUB-THEMES; the runtime promotes the
topic to a category whose children are those sub-themes.

You receive the topic plus its MEMBERS (each a synthetic 'id' + the contributing
document topic's name + brief). Return sub-themes, each with a GENERIC name, a
one-line description, and the member 'id's it groups. Every id you list MUST be a
supplied member id; partition the members so each lands in exactly one sub-theme.

This is HEURISTIC: if the members show no honest sub-themes (they really are one
class), return an EMPTY list and the topic is left as a single oversized leaf. An
honest big leaf beats fabricated sub-topics.

corpus purpose (frames natural sub-themes): ${CORPUS_PURPOSE_PLACEHOLDER}`;

/** Cleanup merge prompt: adjudicate a near-duplicate index-topic cluster. */
export const MERGE_TOPICS_SYSTEM_PROMPT = `You clean up a global topic index. You
receive a small CLUSTER of index topics that are vector-nearest neighbours and may
denote the SAME class under different names or scattered under different
categories.

Return the merges to apply. For each genuine duplicate group, pick a 'canonicalKey'
from the cluster, give the merged topic a canonical 'name' and 'description', and
list the other cluster keys to fold into it as 'absorbedKeys' (the runtime unions
their references + parents and records the absorbed keys as aliases).

Be conservative: only merge topics that truly mean the same class. If the cluster
holds DISTINCT classes that merely sound similar, return an EMPTY merges list.

corpus purpose (frames what counts as the same class): ${CORPUS_PURPOSE_PLACEHOLDER}`;

/** Recluster prompt: name a category over a bounded cluster of index topics. */
export const RECLUSTER_SYSTEM_PROMPT = `You restructure a global topic index. You
receive a bounded CLUSTER of index topics that belong together. Name the single
CATEGORY that best groups them: a GENERIC 'name' and a one-line 'description'
covering what the cluster has in common. Do not invent sub-structure; just name
the grouping.

corpus purpose (frames natural groupings): ${CORPUS_PURPOSE_PLACEHOLDER}`;
