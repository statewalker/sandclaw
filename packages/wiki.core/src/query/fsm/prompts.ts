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

When on-corpus, decompose the prompt into its distinct SUBJECTS. For each subject produce TWO things:
- \`prompt\`: a standalone, natural-language reformulation of the subject. It drives topic-class
  routing over the corpus index. Align the wording with the corpus where natural, but keep named
  entities intact.
- \`ftsQueries\`: the distinctive KEYWORDS for full-text search — individual content terms and named
  entities drawn from the subject, NOT phrases or sentences. List the salient terms (proper nouns,
  organisations, people, places, identifiers/codes, numbers, and the few defining nouns), each as its
  OWN entry; a block matching more entries ranks higher. Give 1–6 entries; omit stop-words and generic
  filler. The same terms are embedded (concatenated) for the semantic (vector) leg, so both legs search
  the same vocabulary.
Write \`prompt\` and \`ftsQueries\` in ENGLISH — the corpus and its index are English, so translate the
subject's wording into English even when the user wrote in another language. (The detected \`language\`
below governs ONLY the final answer, never these retrieval queries.) PRESERVE every specific term and
named entity (proper nouns, organisations, people, places, identifiers/codes, numbers) VERBATIM — never
paraphrase or translate the entities away.

A single-subject prompt yields exactly one subject. Do NOT answer the prompt.

Also extract the prompt's HARD CONSTRAINTS — the conditions any correct answer must satisfy — into
\`constraints\`, each tagged by \`kind\`:
- \`entity\`: a named thing the answer is about (organisation, person, place, product, identifier). Put
  its literal surface tokens (and obvious variants) in \`tokens\`; leave \`text\` empty.
- \`scope\`: a horizon / range / period / qualifier that bounds the answer (e.g. "within the first
  year", a date window, a region). Put its literal tokens in \`tokens\`; leave \`text\` empty.
- \`predicate\`: an ANALYTIC judgement that is not a literal token — a superlative or comparison (e.g.
  "the most costly", "the largest"). Put it in \`text\`; leave \`tokens\` empty.
Extract only constraints actually present; return an empty array when the prompt carries none. These
constraints drive both answer-shape projection and the coverage gate downstream — keep entity and
scope tokens VERBATIM (English), and prefer a few precise tokens over many loose ones.

Also classify the prompt's retrieval shape in \`queryKind\`. DEFAULT to \`lookup\` — a direct
fact/definition/attribute retrieval that one search pass can answer. Emit \`synthesis\` ONLY when the
prompt is UNMISTAKABLY multi-hop, comparative, or aggregative: it compares two or more things, asks a
causal/"why"/"how did X lead to Y" question spanning sources, aggregates across many items, or names
several distinct subjects that must be combined. Be PRECISION-BIASED toward \`synthesis\`: when in any
doubt, choose \`lookup\` — a lookup that turns out to need more depth is widened automatically
downstream, whereas a mislabelled \`synthesis\` forces a simple question down the expensive path.

Also DETECT the language the user wrote the prompt in and return its English name in \`language\` (e.g.
"English", "French", "Japanese") — the final answer will be written in it. Use "English" when the
language cannot be determined. Write \`offCorpusReason\`, when set, in that same language.`;

export const HYPOTHESIZE_PROMPT = `You run the ABDUCTIVE head of a wiki retrieval loop. Given the
user's question and its hard constraints, propose the single MOST-PROMISING rival candidate ANSWER —
a concrete proposed answer to the question, never a restatement of it — then PROJECT what the source
would literally say if that candidate were true.

PROJECT produces the probe:
- \`ftsQueries\`: the literal full-text KEYWORDS a confirming source would carry — the hard-constraint
  tokens (every entity and scope token, VERBATIM) PLUS the distinctive vocabulary of your candidate
  answer. Individual terms, not phrases; omit stop-words. Write them in ENGLISH (the corpus language).
  These terms drive the full-text leg AND, concatenated, the semantic (vector) leg — so both legs
  search the same vocabulary.
- \`synonyms\`: extra surface variants of the hard-constraint tokens so the mechanical coverage gate
  matches alternate phrasings (e.g. "within the first year" → "first 12 months", "12-month"). Empty
  if none.

When \`consumedRivals\` is non-empty, those candidate answers were already tried and rejected — propose
a genuinely DIFFERENT candidate, not a paraphrase. Project the answer's vocabulary; do NOT answer the
prompt yourself.`;

export const SCORE_PROMPT = `You classify a failed retrieval iteration for a wiki abductive loop. You
receive the question, the current candidate ANSWER under test, the hard constraints NOT yet covered in
the pooled evidence, and the pooled evidence summaries. Coverage itself is decided MECHANICALLY
elsewhere — your job is ONLY advisory routing between two loop-backs:
- \`contradicted\`: the pooled evidence positively REFUTES the candidate answer (states something
  incompatible with it). The hypothesis is wrong → it will be rejected and the next rival tried.
- \`narrow\`: the candidate remains PLAUSIBLE but the evidence does not yet confirm the unmet
  constraint(s). The hypothesis is kept and the search is widened.
Prefer \`narrow\` unless the evidence genuinely contradicts the claim. This is advisory only — a wrong
call self-corrects on the next pass. Do not answer the question.`;

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
   with — it is not itself the answer. A section with nothing relevant produces NO entry.
4. PRESERVE VALUES WITH THEIR QUALIFIERS — a later stage must be able to detect and attribute conflicts.
   Keep every value (number, date, amount) VERBATIM together with the qualifiers that pin it down:
   its as-of date, currency/unit, and which entity, fund or scope it refers to. If THIS section states
   more than one value for the same thing, keep them ALL. Never round, normalise, reconcile, or drop a
   value because it looks like or differs from another — divergence between sources is signal the
   downstream stage needs, not noise to clean up.`;

export const COMPOSE_PROMPT = `Answer the question using ONLY the supplied grounded facts. Each fact
carries a \`citations\` list — the section refs it rests on. Return the answer as \`claims\`: an ordered
list where each claim has a \`statement\` (a sentence or bullet; markdown such as **bold** or a "- "
prefix is fine) and a \`citations\` array.

RULES — load-bearing:
1. ANSWER FIRST (bottom line up front). The FIRST claim MUST answer, directly and unambiguously, every
   main sub-question the prompt asks — in one or two sentences, the concrete answer stated plainly. For
   a multi-part question, that first claim resolves EACH part explicitly. The following claims add the
   figures, detail, and context. Never open with background or make the reader hunt for the answer. If
   the supplied facts give DIVERGENT or conflicting values for what is asked, the lead does NOT pick one
   — it states the divergence explicitly and cites each value (see rule 7).
2. ONLY THE EXACT ENTITY / SCOPE / PERIOD ASKED. A fact answers the question only if it concerns the
   SAME entity, scope, and period the question names. A fact about a related but DIFFERENT subject —
   a portfolio holding instead of the management company, a different fund, a different date or period
   than requested — does NOT answer the question. Never present such a fact as the answer. If the
   supplied facts only cover an adjacent subject, treat the question (or that part) as UNANSWERED (rule 6).
3. COMPLETE, WITHIN THE QUESTION'S FRAME. After the lead, be EXHAUSTIVE inside the asked frame: include
   every supplied fact that falls within it, down to fine-grained sub-details (e.g. for "where does
   company X operate", name each specific country the facts give — do not collapse them). But EXCLUDE
   every fact outside that frame, even about the same subject. The test for a claim is whether it
   answers the ASPECT asked — not whether it merely mentions the subject. Add no preamble or padding.
4. LANGUAGE. Write every claim's \`statement\` — and the \`missing\` sentence — in the language named in
   \`language\` (the language the user asked in). Do NOT translate proper nouns, citations/refs, or
   technical terms with no accepted form in that language.
5. NO INVENTION, EVERY CLAIM CITED. Every claim's content MUST come from the supplied facts — do not add,
   infer beyond, generalise past, or embellish them, and never use outside knowledge. Each claim's
   \`citations\` MUST contain refs drawn VERBATIM from the facts it rests on (a claim MAY combine facts
   from different documents, each still cited). If you cannot cite a statement, OMIT it — never emit a
   claim with an empty \`citations\` array, and never invent or alter refs.
6. STATE INSUFFICIENCY EXPLICITLY — never fabricate a substitute. If the facts do not answer the
   question, or answer only PART of it, or only cover a different entity/scope/period than asked, you
   MUST say so plainly: set \`sufficient\` false and write in \`missing\` a complete user-facing sentence
   naming exactly what is not answered (e.g. "Les documents disponibles ne précisent pas la dette à
   long terme de la société de gestion."). This sentence LEADS the delivered answer. Do NOT substitute
   an adjacent or loosely-related fact to fill the gap. When only part is answerable, answer that part
   (rule 1) AND name the missing part in \`missing\`. Set \`sufficient\` true and \`missing\` null ONLY when
   the facts fully and confidently answer every part of the question.
7. SURFACE CONFLICTING / DIVERGENT EVIDENCE — NEVER drop or reconcile it. When the supplied facts give
   different, inconsistent, or contradictory values for the SAME quantity or attribute, you MUST NOT
   silently pick one, average or "reconcile" them, or omit any. Instead: (a) FLAG the divergence in the
   lead claim explicitly ("Les sources divergent sur X :"); (b) include EVERY divergent value as its
   own cited claim (or in the lead claim), each carrying the qualifier that distinguishes it — as-of
   date, currency, entity/fund, or scope — and its own \`citations\` ref, so the reader can trace each
   figure to its source; (c) when values genuinely conflict for the SAME entity, date and scope (a true
   contradiction, not just different dates/currencies), say so plainly and set \`sufficient\` false with
   \`missing\` naming the contradiction. Completeness on divergence OUTRANKS brevity — dropping a
   conflicting fact to give one tidy number is a hard error. NEVER present a single value as settled
   when the facts disagree.

BEST-PARTIAL PATH: when \`unmetConstraints\` is non-empty, the loop exhausted without any evidence
satisfying those hard constraints. Compose the best grounded answer the facts DO support, but you MUST
NOT assert any unmet constraint as satisfied, and you MUST set \`sufficient\` false with \`missing\`
naming those unmet constraint(s). Every claim must still be cited from the supplied facts.`;
