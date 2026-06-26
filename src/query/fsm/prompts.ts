/** System prompts for the query-FSM stages. Kept terse; schemas carry field-level detail. */

export const INTENT_DETECTION_PROMPT = `You triage a user prompt against an LLM-curated wiki, then
decompose it for retrieval.

Be RECALL-FIRST about scope. Downstream the prompt is searched by full-text AND semantic search over
the whole corpus, plus a topic-class ladder — so it is retrievable even when it names entities,
facts, or relationships that do NOT appear in the supplied topic/outlier vocabulary. Treat any prompt
asking for specific information — named people, organisations, places, instruments, products, dates,
figures, or the relationships between them — as ON-corpus, even when no listed class obviously
matches. The class vocabulary is a HINT, never a gate: do NOT reject a prompt merely because it does
not map to a class. Let the downstream search decide whether evidence actually exists.

Set onCorpus FALSE only when the prompt is not a retrieval request against this corpus at all — e.g. a
greeting or small talk, a creative-writing or coding task, arithmetic, or a question about a domain
plainly unrelated to the corpus with no searchable corpus term. Then give a one-line offCorpusReason
and return no subjects.

When on-corpus, decompose the prompt into its distinct SUBJECTS. For each subject produce THREE things:
- \`prompt\`: a standalone, natural-language reformulation of the subject. It drives topic-class
  routing over the corpus index. Align the wording with the corpus where natural, but keep named
  entities intact.
- \`semanticQuery\`: a HYPOTHETICAL ANSWER to the subject — a short, factual passage written as if it
  were an ideal excerpt from a corpus document that answers it. Do NOT echo the question; assert a
  plausible answer in the corpus's register (1–3 sentences). This is embedded for SEMANTIC (vector)
  retrieval, where a fake answer lands nearer the real answers than the bare question does. Any
  specifics you invent are embedding bait only — never shown or trusted downstream.
- \`ftsQueries\`: the distinctive KEYWORDS for full-text search — individual content terms and named
  entities drawn from the subject, NOT phrases or sentences. List the salient terms (proper nouns,
  organisations, people, places, identifiers/codes, numbers, and the few defining nouns), each as its
  OWN entry; a block matching more entries ranks higher. Give 1–6 entries; omit stop-words and generic
  filler.
Write \`prompt\`, \`semanticQuery\`, and \`ftsQueries\` in ENGLISH — the corpus and its index are
English, so translate the subject's wording into English even when the user wrote in another language.
(The detected \`language\` below governs ONLY the final answer, never these retrieval queries.)
PRESERVE every specific term and named entity (proper nouns, organisations, people, places,
identifiers/codes, numbers) VERBATIM across all three — never paraphrase or translate the entities away.

A single-subject prompt yields exactly one subject. Do NOT answer the prompt.

Also DETECT the language the user wrote the prompt in and return its English name in \`language\` (e.g.
"English", "French", "Japanese") — the final answer will be written in it. Use "English" when the
language cannot be determined. Write \`offCorpusReason\`, when set, in that same language.`;

export const TOPIC_SELECT_PROMPT = `You select the topic and outlier classes worth searching for a
subject. You receive the subject and the corpus's topic + outlier classes, each as
key/name/description with no documents attached. Return the KEY SLUGS — drawn verbatim from the
supplied lists — of every class plausibly relevant to the subject. Be EXHAUSTIVE: over-inclusion is
corrected by later grounding, but a class omitted here can never contribute. Populate outlierKeys for
questions about anomalies, exceptions, disagreements, or surprises, and include plainly-relevant
outliers otherwise. When nothing plausibly matches, return empty arrays. Selection only — do not
answer the subject.`;

export const TOPIC_DESCENT_PROMPT = `You route a subject through a topic index organised as a
bounded-fan-out DAG of categories (groupings) over index topics (leaves). You receive the subject and
the CURRENT FRONTIER — a batch of nodes, each with its key, name, description, kind, and (for a
category) its direct children. For EVERY node return a relevance score for the subject:
relevant = 2 / maybe = 1 / non-relevant = 0. Score 0 prunes the node — it and its subtree are
dropped, so do not score 0 for a plausibly-related grouping. For a CATEGORY you score > 0, also return
\`descendKeys\`: the child keys (verbatim) worth descending into — be inclusive, since a child omitted
here can never contribute. For an index topic (leaf), or a category not worth opening, leave
\`descendKeys\` empty. Selection only — do not answer the subject.`;

export const ROLLING_SUMMARIZE_PROMPT = `You extract prompt-relevant information from wiki sections, one section at a time.

The input is ONE XML payload — use each part for its stated role ONLY:
- <question> … </question> — the user's prompt. Extract only content that helps answer it.
- <sources> … </sources> — the documents to mine, each a <document title="…"> containing:
  - <document_summary> — the document's overall summary. CONTEXT/navigation ONLY.
  - <section ref="…"> — a candidate section, carrying:
    - <context> — the section's place in the document outline: each ancestor TOC node's title and
      summary, outermost first. CONTEXT ONLY.
    - <title> — the section's title. CONTEXT ONLY.
    - <content> — the section's RAW text. This is the ONLY SOURCE of facts and citations.

For EACH <section>, decide whether its <content> contains anything relevant to <question>:
- If it does, emit ONE entry in \`summaries\` with that section's \`sectionRef\` (verbatim) and a
  \`summary\` that captures ALL prompt-relevant information from the <content> — the concrete specifics
  (full entity names, numbers, dates, relationships, conditions) a later stage needs. Be EXHAUSTIVE
  and over-inclusive: capture EVERY contribution that bears on the question, including SMALL, PARTIAL,
  INDIRECT, or NEGATIVELY-FRAMED ones — e.g. a minor or secondary factor, an absence/omission, something
  avoided or excluded, an adverse or detracting effect — even when the <content> frames it as slight or
  secondary. The downstream stage decides what matters; your job is to miss nothing.
- If the section has NOTHING relevant to the question, SKIP it entirely — emit no entry for it.

RULES — load-bearing:
1. Every entry MUST carry the section's \`sectionRef\` VERBATIM, and every word of its \`summary\` MUST be
   supported by THAT section's <content>. Never use the <context>, <title>, <document_summary>, or
   outside / "common-sense" knowledge as the source of a fact.
2. One entry per kept section; never merge content from different sections into one entry.
3. EXTRACT, do NOT ANSWER. The \`summary\` gathers the relevant facts for a downstream stage to answer
   with — it is not itself the answer. A section with nothing relevant produces NO entry.`;

export const COMPOSE_PROMPT = `Answer the question using ONLY the supplied grounded facts. Each fact
carries a \`citations\` list — the section refs it rests on. Return the answer as \`claims\`: an ordered
list where each claim has a \`statement\` (a sentence or bullet; markdown such as **bold** or a "- "
prefix is fine) and a \`citations\` array.

RULES — load-bearing:
1. COMPLETE, WITHIN THE QUESTION'S FRAME. First fix the specific ASPECT the question asks about. Then
   be EXHAUSTIVE inside that frame: include every supplied fact that falls within it, down to the
   fine-grained sub-details (e.g. for "where does company X operate", name each specific country or
   region the facts give — do not collapse them). Prefer a complete, detailed answer over a terse one.
   But EXCLUDE every fact outside that frame, even when it concerns the same subject (e.g. that
   company's founders or finances are out of frame for a question about its geography). The test for a
   claim is whether it answers the ASPECT asked — not whether it merely mentions the subject. Add no
   preamble, padding, or unprompted conclusions.
2. LANGUAGE. Write every claim's \`statement\` in the language named in \`language\` (the language the
   user asked in). Do NOT translate proper nouns, citations/refs, or technical terms that have no
   accepted form in that language.
3. NO INVENTION. Every claim's content MUST come from the supplied facts — do not add, infer beyond,
   generalise past, or embellish them, and never use outside or "common-sense" knowledge. If a fact
   you'd need is not present, do NOT supply it from your own knowledge.
4. EVERY CLAIM CITED. Each claim's \`citations\` MUST contain one or more refs drawn VERBATIM from the
   \`citations\` of the facts it rests on (a claim MAY combine facts from different documents, each still
   cited). If you cannot cite a statement from the supplied facts, OMIT it — never emit a claim with an
   empty \`citations\` array, and never invent or alter refs.

Then judge sufficiency: set \`sufficient\` true if the facts fully and confidently answer the question;
set it false when information the question needs is absent, and name the missing piece in \`missing\`
(this triggers a wider evidence search; use null when sufficient).`;
