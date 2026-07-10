import { useMemo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CitationsList } from "@/components/citations-list";
import { CiteChip } from "@/components/cite-chip";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { orderedCitationUris, promoteParagraphs } from "@/lib/pages";
import type { Section } from "@/lib/types";

export function SectionContent({
  project,
  section,
  onCiteClick,
  onTopicClick,
  onSuggestionClick,
}: {
  project: string;
  section: Section;
  onCiteClick: (uri: string) => void;
  onTopicClick: (key: string, topicKind: "topic" | "outlier") => void;
  /** When set, each retrieval suggestion becomes a button that runs a search. */
  onSuggestionClick?: (suggestion: string) => void;
}) {
  // Canonical citation order: first appearance in prose, then any extras.
  const order = useMemo(
    () =>
      orderedCitationUris(
        section.text,
        section.citations.map((c) => c.uri),
      ),
    [section.text, section.citations],
  );
  const citeNumber = (uri: string) => {
    const i = order.indexOf(uri);
    return i === -1 ? "?" : i + 1;
  };

  // Promote single newlines to paragraph breaks (table blocks kept intact),
  // then rewrite `[[uri]]` into cite: links carrying the canonical number.
  const md = useMemo(() => {
    const withParagraphs = promoteParagraphs(section.text);
    return withParagraphs.replace(
      /\[\[([^\]]+)\]\]/g,
      (_match, raw: string) => {
        const uri = raw.trim();
        const i = order.indexOf(uri);
        return `[${i === -1 ? "?" : i + 1}](cite:${encodeURIComponent(uri)})`;
      },
    );
  }, [section.text, order]);

  return (
    <article className="mx-auto w-full max-w-2xl px-8 py-8">
      <h2 className="mb-6 text-xl font-semibold tracking-tight">
        {section.title}
      </h2>

      {section.text.trim() ? (
        <div className="prose prose-sm prose-neutral max-w-none dark:prose-invert">
          <Markdown
            remarkPlugins={[remarkGfm]}
            urlTransform={(url) => url}
            components={{
              a({ href, children }) {
                if (href?.startsWith("cite:")) {
                  const uri = decodeURIComponent(href.slice("cite:".length));
                  return (
                    <CiteChip
                      label={String(children)}
                      uri={uri}
                      onClick={onCiteClick}
                    />
                  );
                }
                return (
                  <a href={href} target="_blank" rel="noreferrer">
                    {children}
                  </a>
                );
              },
            }}
          >
            {md}
          </Markdown>
        </div>
      ) : (
        <p className="text-sm italic text-muted-foreground">
          No content for this section.
        </p>
      )}

      {section.suggestions.length > 0 && (
        <section className="mt-8">
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">
            Retrieval suggestions
          </h3>
          <ul className="space-y-1 text-sm">
            {section.suggestions.map((s) =>
              onSuggestionClick ? (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => onSuggestionClick(s)}
                    title="Search the vault for this"
                    className="w-full rounded-md px-2 py-1 text-left text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {s}
                  </button>
                </li>
              ) : (
                <li key={s} className="list-disc pl-5 text-muted-foreground">
                  {s}
                </li>
              ),
            )}
          </ul>
        </section>
      )}

      {section.topics.length > 0 && (
        <section className="mt-8">
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">
            Topics
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {section.topics.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => onTopicClick(t.key, "topic")}
              >
                <Badge
                  variant="secondary"
                  className="cursor-pointer hover:bg-accent"
                >
                  {t.name}
                </Badge>
              </button>
            ))}
          </div>
        </section>
      )}

      {section.outliers.length > 0 && (
        <section className="mt-8">
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">
            Outliers
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {section.outliers.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => onTopicClick(o.key, "outlier")}
              >
                <Badge
                  variant="outline"
                  className="cursor-pointer hover:bg-accent"
                >
                  {o.name}
                </Badge>
              </button>
            ))}
          </div>
        </section>
      )}

      {order.length > 0 && (
        <section className="mt-8">
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">
            Citations
          </h3>
          <CitationsList
            project={project}
            uris={order}
            onCiteClick={onCiteClick}
          />
        </section>
      )}

      {section.claims.length > 0 && (
        <section className="mt-8">
          <Separator className="mb-6" />
          <h3 className="mb-3 text-sm font-medium text-muted-foreground">
            Claims &amp; evidence
          </h3>
          <ol className="space-y-3 text-sm">
            {section.claims.map((claim, i) => (
              <li
                key={`${claim.text.slice(0, 40)}|${claim.citations.map((c) => c.uri).join(",")}`}
                className="flex gap-2"
              >
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {i + 1}.
                </span>
                <p className="leading-relaxed">
                  {claim.text}
                  {claim.citations.map((c) => (
                    <CiteChip
                      key={c.uri}
                      label={citeNumber(c.uri)}
                      uri={c.uri}
                      onClick={onCiteClick}
                    />
                  ))}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </article>
  );
}
