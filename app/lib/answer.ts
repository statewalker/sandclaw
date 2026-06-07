import type { Answer, AnswerTopic } from "@statewalker/resources-wiki";
import { bareUri, orderedCitationUris, rewriteCitations } from "./pages";
import type { Citation, Section, Topic } from "./types";

/** Map a query `AnswerTopic` to the viewer's `Topic`, normalising its citations. */
function toTopic(t: AnswerTopic): Topic {
  return {
    key: t.key,
    name: t.name,
    description: t.description || undefined,
    citations: t.citations.map((c) => ({ uri: bareUri(c.uri) })),
  };
}

/**
 * Project a query `Answer` into the viewer's `Section` shape so the same
 * `SectionContent` renderer draws a live answer exactly like a stored report
 * section. `wiki://` citation markers and topic citations are reduced to the bare
 * `file#anchor` form the chips/source panel resolve against; the canonical citation
 * order is derived from the prose markers plus every topic/outlier citation. Any
 * verification caveats are appended as a trailing blockquote. `opts` lets a report
 * place several answers as distinct, ordered sections.
 */
export function answerToSection(
  answer: Answer,
  question: string,
  opts: { id?: string; order?: number; slug?: string } = {},
): Section {
  const topics = answer.topics.map(toTopic);
  const outliers = answer.outliers.map(toTopic);
  const extra = [...topics, ...outliers].flatMap((t) =>
    t.citations.map((c) => c.uri),
  );
  const caveat = answer.caveats.length
    ? `\n\n> ${answer.caveats.join(" ")}`
    : "";
  const text = rewriteCitations(answer.text) + caveat;
  const citations: Citation[] = orderedCitationUris(text, extra).map((uri) => ({
    uri,
  }));
  return {
    id: opts.id ?? "answer",
    order: opts.order ?? 0,
    slug: opts.slug ?? "answer",
    title: question,
    text,
    claims: [],
    citations,
    topics,
    outliers,
    suggestions: answer.suggestions,
  };
}
