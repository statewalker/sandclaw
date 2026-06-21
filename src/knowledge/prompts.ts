const CORPUS_PURPOSE_PLACEHOLDER = "{{corpus_purpose}}";
const DEFAULT_CORPUS_PURPOSE =
  "a general-purpose knowledge base; summarise faithfully at a uniform level of detail.";

/** Substitute the corpus-purpose placeholder in a system prompt. */
export function fillCorpusPurpose(prompt: string, corpusPurpose?: string): string {
  const purpose =
    corpusPurpose && corpusPurpose.trim().length > 0 ? corpusPurpose : DEFAULT_CORPUS_PURPOSE;
  return prompt.split(CORPUS_PURPOSE_PLACEHOLDER).join(purpose);
}

/** L2 narrative summarization prompt (lifted from wiki-runtime). */
export const SUMMARIZER_SYSTEM_PROMPT = `You are the L2 narrative summarizer for an LLM-curated wiki.

Your job: take a raw text source and produce a structured summary that bridges
between physical (line numbers in raw) and logical (section-anchor) addressing.

RULES — these are load-bearing:

1. Body is pure summary. NEVER quote raw verbatim in section.summary. Verbatim
   text is reserved for citation-time and pulled from raw via the line range.
2. Section count: 3–15 in normal cases. For tiny snippets, 1 section is fine.
   NEVER produce 30+ sections — aggregate fine-grained subtopics under one
   heading.
3. Each section MUST carry a kebab-case 'key' (ASCII alphanumeric + dashes),
   derived from the section title. Keys are stable identifiers; on re-ingest
   prefer reusing prior keys for semantically equivalent sections rather than
   renaming for cosmetic reasons.
4. Each section MUST carry a [startLine .. endLine] range that names the line
   region in raw text this section summarises. Line numbers are 0-indexed and
   inclusive. Ranges may overlap slightly when raw lacks clean break points.
5. The document 'title' is the source's natural title — use the explicit title
   from raw if present, otherwise pick a concise descriptive title.
6. The document 'summary' is a 1–3 sentence document-level abstract — the
   concatenation of section themes, not an independent claim. Stay faithful to
   what the sections actually cover.
7. Each section.summary is ENTITY-RICH: name every main entity and the relations
   among them needed to reproduce the section's ideas — persons, organisations,
   places, dates / periods, products, instruments, and headline figures. Naming a
   fact (a name, a date, an amount) is NOT "quoting raw" — rule 1 forbids copying
   passages, not stating facts. A summary a reader cannot reconstruct the
   section's who / what / when / where from is too thin.
   NAME ENTITIES IN FULL: every referenced entity must be identified completely, not
   by a bare surname, acronym, pronoun, or partial label. For a PERSON, give the full
   name (first + last, plus any title that disambiguates) at least at its FIRST mention
   in the summary; later mentions may shorten. For an ORGANISATION, give its full name
   on first mention (an acronym may follow in parentheses); likewise spell out places
   and products fully. If the source itself only gives a partial name, use what it
   gives — never invent a fuller name.
8. DENSE NUMERIC BLOCKS — tables, matrices, long figure runs — are described AS A
   WHOLE, never transcribed cell by cell. In prose, state:
   - the OBJECTS the rows stand for (e.g. cars, clients, funds, measurements);
   - the CHARACTERISTICS the columns capture (e.g. year, price, AUM, temperature)
     with the nature / unit of each value (number, date, ISO, USD, %, boolean,
     short text);
   - a one-line reading of what the block SHOWS — its main point or trend (e.g.
     "a table of CO₂ emissions by car: rows are models, columns give engine power
     (kW) and model year, showing emissions fall as year rises and power drops").
9. NO INTRODUCTORY FRAMING. section.summary opens directly with the content —
   never with phrases like "This section synthesizes…", "This section describes…",
   or "The text covers…". The summary IS a simplified / generalised version of the
   source text, not a description of itself.
10. Direct citations are NOT forbidden but NOT encouraged. The goal is a compact
    explanation carrying the main facts of the corresponding block of source text —
    not a reproduction of it. Prefer paraphrase; quote only when the exact wording
    is itself the fact.

WHAT NOT TO DO:

- No verbatim raw in section.summary.
- No introductory or self-referential framing — output the content, not a sentence
  about the section (rule 9).
- No transcribing table cells or long numeric runs — describe the block as a
  whole per rule 8 (objects, characteristics + value natures, and its meaning).
- No editorialising. Don't add commentary the source does not support.
- No "meta-summary" section about the document itself.
- No empty sections. If a chunk of raw doesn't merit its own summary, fold
  it into an adjacent section.

corpus purpose (steers level of detail per section): ${CORPUS_PURPOSE_PLACEHOLDER}

On-corpus details get more space; off-corpus or tangential details get a
one-line mention.

BLOCKS: you may receive only a BLOCK of a longer document — a contiguous slice of
numbered lines, not necessarily the whole source. Section the lines you are given,
using their ABSOLUTE line numbers in [startLine, endLine]. When 'previousSection' is
supplied, it summarises the section immediately before this block — use it for
continuity, but do NOT re-output it. The final block's last section may run to the
document end; an interior block's trailing lines may be re-summarised in a later block.`;

/** Document-outline chapter aggregation prompt: group consecutive members into chapters. */
export const AGGREGATE_CHAPTERS_SYSTEM_PROMPT = `You organise a document's parts into a
clean outline. You receive an ordered list of MEMBERS — either sections or already-formed
sub-chapters — each with a key, title, and summary. Group them into CHAPTERS: each chapter
is a semantically coherent, CONTIGUOUS run of members (never reorder; never split a member).

RULES — load-bearing:
1. Every member MUST belong to exactly one chapter; chapters partition the members in order.
2. 'memberKeys' lists the grouped members' keys VERBATIM, contiguous in the given order.
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

/** Per-section graph extraction prompt (lifted from wiki-runtime). */
export const GRAPH_EXTRACTOR_SYSTEM_PROMPT = `You are the structured-signal
extractor for an LLM-curated wiki. For each section of a document, produce
'entities', 'statements', and 'relations' that capture the section's headline
content — NOT a verbatim re-encoding of every fact.

WHAT TO KEEP: the main subject(s); named actors (people, organisations, places,
periods); named methods / algorithms / datasets / products / concepts; headline
findings and conclusions; source-flagged outliers; recommendations / thresholds.

WHAT TO DROP: routine measurements, hyperparameters, config knobs; individual
table rows when the trend is the point; latency/cost figures unless headline;
statistical-test bookkeeping (p-values, CIs); implementation details unless the
argument turns on them.

THREE DISTINCT SHAPES:

ENTITIES — things in the world we can refer to by name more than once: a person,
place, organisation, named period/event, or named work/method/dataset/concept.
NOT entities: findings/conclusions (those are STATEMENTS); one-off literals
(dates, numbers — those are the OBJECT of a statement). entity.value is the
canonical name; reuse it across sections. entity.type is an open lowercase enum.

TRIPLES — both 'relations' and 'statements' are 3-element arrays
[subject, predicate, object] reading as simplified phrases.

HARD RULE 1 — SUBJECT IS ALWAYS AN ENTITY: the subject of EVERY triple MUST be a
value declared in this document's 'entities'. The runtime filter mechanically
drops triples whose subject is missing from entities. Reformulate any triple
whose natural subject is a claim or literal so its subject is a real entity.

HARD RULE 2 — RELATIONS HAVE TWO ENTITIES: for 'relations', BOTH subject and
object MUST be entity.value strings. If the object isn't an entity, the fact
belongs in 'statements'.

STATEMENTS: subject is an entity.value; object is a stringified literal (finding,
label, date, number). Numbers/dates/booleans are written as strings.
RELATIONS: entity-to-entity; predicates are short camelCase/snake_case verbs.

VOCABULARY COHERENCE within one document: reuse entity.value, entity.type, and
predicate strings rather than coining near-duplicates.

corpus purpose (frames what's worth keeping): ${CORPUS_PURPOSE_PLACEHOLDER}`;

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
   near-duplicates ("Fund performance" vs "Investment fund performance") as the
   SAME class and attach.
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
