import {
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  SquareArrowOutUpRight,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PdfView } from "@/components/pdf-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { parseCitationUri } from "@/lib/pages";
import type {
  PdfRequest,
  ResolvedCitation,
  TopicDetail,
  TopicReference,
} from "@/lib/types";

export type ContextSelection =
  | { kind: "citation"; uri: string }
  | { kind: "topic"; key: string; topicKind: "topic" | "outlier" };

function selectionKey(s: ContextSelection): string {
  return s.kind === "citation" ? `c:${s.uri}` : `t:${s.topicKind}:${s.key}`;
}

export function ContextPanel({
  project,
  selection,
  onOpenCitation,
  onOpenTopic,
  onOpenPdf,
}: {
  project: string;
  selection: ContextSelection | null;
  onOpenCitation: (uri: string) => void;
  onOpenTopic: (key: string, topicKind: "topic" | "outlier") => void;
  onOpenPdf: (req: PdfRequest) => void;
}) {
  const key = selection ? selectionKey(selection) : null;
  const url =
    selection?.kind === "citation"
      ? `/api/source?project=${encodeURIComponent(project)}&uri=${encodeURIComponent(selection.uri)}`
      : selection?.kind === "topic"
        ? `/api/topic?project=${encodeURIComponent(project)}&key=${encodeURIComponent(selection.key)}&kind=${selection.topicKind}`
        : null;

  const [content, setContent] = useState<{ key: string; data: unknown } | null>(
    null,
  );

  useEffect(() => {
    if (!url || !key) return;
    let cancelled = false;
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setContent({ key, data });
      })
      .catch(() => {
        if (!cancelled) setContent({ key, data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [url, key]);

  if (!selection) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Select a citation or topic to see details here.
      </div>
    );
  }

  const loading = content?.key !== key;
  if (loading) {
    return (
      <div className="flex h-full items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (selection.kind === "citation") {
    return (
      <CitationView
        project={project}
        data={content?.data as ResolvedCitation | null}
        onOpenTopic={onOpenTopic}
        onOpenPdf={onOpenPdf}
      />
    );
  }
  return (
    <TopicView
      data={content?.data as TopicDetail | null}
      onOpenCitation={onOpenCitation}
    />
  );
}

function CitationView({
  project,
  data,
  onOpenTopic,
  onOpenPdf,
}: {
  project: string;
  data: ResolvedCitation | null;
  onOpenTopic: (key: string, topicKind: "topic" | "outlier") => void;
  onOpenPdf: (req: PdfRequest) => void;
}) {
  if (!data?.found) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        This source is not indexed in the report&apos;s wiki.
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col">
      <div className="max-h-[45%] shrink-0 overflow-y-auto border-b p-4">
        <h3 className="text-sm font-semibold leading-snug">{data.docTitle}</h3>
        <p className="truncate font-mono text-xs text-muted-foreground">
          {data.file}
        </p>

        <h4 className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Cited section
        </h4>
        <p className="text-sm font-medium">{data.sectionTitle}</p>
        {data.sectionSummary ? (
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {data.sectionSummary}
          </p>
        ) : null}

        {data.topics && data.topics.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {data.topics.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => onOpenTopic(t.key, "topic")}
              >
                <Badge
                  variant="outline"
                  className="cursor-pointer hover:bg-accent"
                >
                  {t.name}
                </Badge>
              </button>
            ))}
          </div>
        )}

        {data.hasPdf && (
          <Button
            size="sm"
            className="mt-4"
            onClick={() =>
              onOpenPdf({
                file: data.file,
                page: data.page ?? 1,
                title: data.docTitle ?? data.file,
              })
            }
          >
            <FileText className="size-4" />
            Open PDF{data.page ? ` · p.${data.page}` : ""}
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 bg-muted/30">
        {data.hasPdf ? (
          <PdfView project={project} file={data.file} page={data.page ?? 1} />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
            No PDF available for this document.
          </div>
        )}
      </div>
    </div>
  );
}

interface DocGroup {
  docTitle: string;
  file: string;
  refs: TopicReference[];
}

function TopicView({
  data,
  onOpenCitation,
}: {
  data: TopicDetail | null;
  onOpenCitation: (uri: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Group covering sections by their source document.
  const groups = useMemo<DocGroup[]>(() => {
    const map = new Map<string, DocGroup>();
    for (const r of data?.references ?? []) {
      const file = parseCitationUri(r.uri).file;
      const g = map.get(file) ?? { docTitle: r.docTitle, file, refs: [] };
      g.refs.push(r);
      map.set(file, g);
    }
    return [...map.values()];
  }, [data]);

  if (!data) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Topic not found.</div>
    );
  }

  const toggle = (uri: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(uri)) next.delete(uri);
      else next.add(uri);
      return next;
    });

  return (
    <div className="flex h-full flex-col">
      {/* Fixed header */}
      <div className="shrink-0 border-b p-4">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold leading-snug">{data.name}</h3>
          <Badge variant="secondary" className="shrink-0">
            {data.kind === "outlier" ? "Outlier" : "Topic"}
          </Badge>
        </div>
        {data.description ? (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {data.description}
          </p>
        ) : null}
        <p className="mt-2 text-xs text-muted-foreground">
          Covered by {data.references.length}{" "}
          {data.references.length === 1 ? "section" : "sections"} in{" "}
          {groups.length} {groups.length === 1 ? "document" : "documents"}
        </p>
      </div>

      {/* Scrollable, document-grouped citations */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.file}>
              <div className="px-1">
                <p className="text-sm font-medium leading-snug">{g.docTitle}</p>
                <p className="truncate font-mono text-[0.65rem] text-muted-foreground/70">
                  {g.file}
                </p>
              </div>
              <ul className="mt-1 space-y-0.5">
                {g.refs.map((r) => {
                  const isOpen = expanded.has(r.uri);
                  return (
                    <li key={r.uri} className="rounded-md hover:bg-accent/50">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => toggle(r.uri)}
                          aria-expanded={isOpen}
                          className="flex min-w-0 flex-1 items-center gap-1 px-2 py-1.5 text-left text-sm"
                        >
                          {isOpen ? (
                            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                          )}
                          <span className="truncate">{r.sectionTitle}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenCitation(r.uri)}
                          title="Open full citation"
                          className="mr-1 shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                          <SquareArrowOutUpRight className="size-3.5" />
                        </button>
                      </div>
                      {isOpen ? (
                        <p className="px-2 pb-2 pl-7 text-xs leading-relaxed text-muted-foreground">
                          {r.sectionSummary ||
                            "No summary available for this section."}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
