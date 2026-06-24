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
  organisations, people, places, tickers, numbers, and the few defining nouns), each as its OWN
  entry; a block matching more entries ranks higher. Give 1–6 entries; omit stop-words and generic
  filler.
PRESERVE every specific term and named entity (proper nouns, organisations, people, places, tickers,
numbers) VERBATIM across \`prompt\`, \`semanticQuery\`, and \`ftsQueries\` — never paraphrase them away.

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

export const SECTION_SELECT_PROMPT = `You filter candidate wiki sections for relevance to a prompt. You
receive the full original prompt and a batch of candidate sections grouped by their source document
(document title, then each section's URI, title, and summary). Return the URIs — verbatim — of the
sections that could plausibly contain facts that help answer the prompt. LEAN INCLUSIVE: keep every
section whose title/summary indicates it bears on the prompt, INCLUDING supporting detail, context,
and related specifics — completeness matters, and downstream stages extract only the relevant facts.
Drop a section ONLY when its title/summary shows it does not bear on the prompt at all (e.g. it is
merely from a relevant document but about a different matter). Return an empty array when none in this
batch qualify. Selection only — do not answer the prompt.`;

export const SUMMARIZE_PROMPT = `You extract question-specific grounded facts from wiki documents.

The input is ONE XML payload with these parts — use each part for its stated role ONLY:
- <question> … </question> — the user's prompt. Extract only content that helps answer it.
- <sources> … </sources> — the documents to mine, each a <document title="…"> containing:
  - <document_summary> — the document's overall summary. CONTEXT/navigation ONLY.
  - <chapter title="…"> with <chapter_summary> — an optional intra-document grouping. CONTEXT ONLY.
  - <section ref="…"> — a retrieved section, carrying:
    - <section_title> — the section's title. CONTEXT ONLY.
    - <section_summary> — the section's pre-existing generic summary. CONTEXT ONLY — it may OMIT
      specifics the question needs, so it is a guide, never the source of a fact.
    - <graph> — the section's STRUCTURED FACTS: an "Entities:" line plus "Statements:" / "Relations:"
      bullets, each "subject — predicate — object" with a trailing {…} details object of qualifiers
      (year, currency, …). This is the SOURCE of facts and citations.
    - <raw_content> — present ONLY when a section has no <graph>; then it is the section's ORIGINAL
      TEXT and is the fallback SOURCE of facts and citations.

Return \`facts\`: question-specific statements, each grounded in the section's <graph> (or its
<raw_content> fallback). A statement should be information-rich — capture the concrete specifics the
question needs (full entity names, numbers, dates, relationships, and any details qualifiers).
Together the facts are the question's grounded summary.

RULES — load-bearing:
1. Every fact MUST cite ≥1 section \`ref\` VERBATIM, and every word of it MUST be supported by the
   cited section(s)' <graph> (or <raw_content> fallback). Never use a <section_summary>, a title, or
   outside / "common-sense" knowledge as the source of a fact.
2. A single fact MUST draw only on sections of ONE document — NEVER merge content across documents.
   When two documents say related things, emit a SEPARATE fact per document.
3. Keep only facts relevant to <question>; discard the rest. Do NOT answer the question — only
   extract its grounded facts.`;

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
