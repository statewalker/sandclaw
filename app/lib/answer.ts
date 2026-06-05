import type { Answer } from "@repo/wiki-runtime/embed";
import { orderedCitationUris } from "./pages";
import type { Citation, Section, Topic } from "./types";

/** Map runtime `AnswerTopic` / `AnswerOutlier` to the viewer's `Topic`. */
function toTopic(t: {
  key: string;
  name: string;
  description?: string;
  citations: { uri: string }[];
}): Topic {
  return {
    key: t.key,
    name: t.name,
    description: t.description || undefined,
    citations: t.citations.map((c) => ({ uri: c.uri })),
  };
}

/**
 * Project a live-query `Answer` into the viewer's `Section` shape so the same
 * `SectionContent` renderer draws a streamed answer exactly like a stored
 * report section. The top-level citation list is the canonical citation order
 * derived from the prose markers plus every topic/outlier citation; `claims`
 * is empty (the published `Answer` carries citations inline, not as claims).
 */
export function answerToSection(answer: Answer, question: string): Section {
  const topics = answer.topics.map(toTopic);
  const outliers = answer.outliers.map(toTopic);
  const extra = [...topics, ...outliers].flatMap((t) =>
    t.citations.map((c) => c.uri),
  );
  const citations: Citation[] = orderedCitationUris(answer.text, extra).map(
    (uri) => ({ uri }),
  );
  return {
    id: "answer",
    order: 0,
    slug: "answer",
    title: question,
    text: answer.text,
    claims: [],
    citations,
    topics,
    outliers,
    suggestions: answer.suggestions,
  };
}
