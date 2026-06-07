import {
  FileText,
  Loader2,
  MessageSquareText,
  Save,
  Search,
} from "lucide-react";
import { useEffect, useState } from "react";
import { ClientOnly } from "@/components/client-only";
import {
  ContextPanel,
  type ContextSelection,
} from "@/components/context-panel";
import { PdfDialog } from "@/components/pdf-dialog";
import { ProjectNav } from "@/components/project-nav";
import { SectionContent } from "@/components/section-content";
import { SectionNav } from "@/components/section-nav";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Spinner } from "@/components/ui/spinner";
import {
  type SearchStatus,
  useVaultSearch,
} from "@/components/use-vault-search";
import { answerToSection } from "@/lib/answer";
import type { PdfRequest, Section } from "@/lib/types";

interface WorkspaceProps {
  project: string;
  /** Present on `/reports/{id}` — adds a Report tab (TOC + content). */
  report?: { id: string; sections: Section[] };
  /** Present on `/answers/{id}` — adds an Answer tab (single section). */
  answer?: { id: string; title: string; section: Section };
  /** Optional question to pre-fill + run on mount (the `?q=` autorun). */
  autoQuery?: string;
  /** Optional global topic key to open in the context panel on load. */
  initialTopic?: string;
}

type Tab = "report" | "answer" | "search";

const STATUS_DOT: Record<SearchStatus, string> = {
  idle: "bg-muted-foreground/30",
  running: "bg-blue-500",
  done: "bg-emerald-500",
  error: "bg-destructive",
};
const STAGE_DOT: Record<string, string> = {
  running: "bg-blue-500",
  done: "bg-emerald-500",
  failed: "bg-destructive",
};
const STAGE_LABELS: Record<string, string> = {
  reformulate: "Reformulate query",
  retrieve: "Retrieve evidence",
  respond: "Compose response",
  verify: "Verify citations",
};

function stageLabel(name: string): string {
  if (STAGE_LABELS[name]) return STAGE_LABELS[name];
  const spaced = name.replace(/([A-Z])/g, " $1").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export default function VaultWorkspace(props: WorkspaceProps) {
  return (
    <ClientOnly
      fallback={
        <div className="grid h-screen place-items-center text-sm text-muted-foreground">
          Loading…
        </div>
      }
    >
      <WorkspaceBody {...props} />
    </ClientOnly>
  );
}

function WorkspaceBody({
  project,
  report,
  answer,
  autoQuery,
  initialTopic,
}: WorkspaceProps) {
  const contextual: Tab | null = report ? "report" : answer ? "answer" : null;
  const [tab, setTab] = useState<Tab>(contextual ?? "search");
  const [selection, setSelection] = useState<ContextSelection | null>(
    initialTopic
      ? { kind: "topic", key: initialTopic, topicKind: "topic" }
      : null,
  );
  const [pdf, setPdf] = useState<PdfRequest | null>(null);
  const [selectedId, setSelectedId] = useState(report?.sections[0]?.id ?? "");
  const search = useVaultSearch(project);

  // `?q=` autorun (project home → search). Mount-only.
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useEffect(() => {
    if (autoQuery) {
      setTab("search");
      search.run(autoQuery);
    }
  }, []);

  const openCitation = (uri: string) => setSelection({ kind: "citation", uri });
  const openTopic = (key: string, topicKind: "topic" | "outlier") =>
    setSelection({ kind: "topic", key, topicKind });
  const selectSection = (id: string) => {
    setSelectedId(id);
    setSelection(null);
  };
  // A clicked retrieval suggestion pre-fills the query, flips to Search, runs.
  const runSuggestion = (text: string) => {
    setTab("search");
    search.run(text);
  };

  const selectedSection =
    report?.sections.find((s) => s.id === selectedId) ?? report?.sections[0];
  const answerSection = search.answer
    ? answerToSection(search.answer, search.asked)
    : null;

  return (
    <div className="flex h-screen flex-col">
      <ProjectNav
        project={project}
        section={
          contextual === "report"
            ? "reports"
            : contextual === "answer"
              ? "answers"
              : "search"
        }
      />

      <div className="flex min-h-0 flex-1">
        <ResizablePanelGroup className="min-h-0 flex-1">
          {/* LEFT: tabbed panel */}
          <ResizablePanel defaultSize={62} minSize={35}>
            <div className="flex h-full flex-col">
              <div className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5">
                {report && (
                  <TabButton
                    active={tab === "report"}
                    onClick={() => setTab("report")}
                    icon={<FileText className="size-3.5" />}
                    label="Report"
                  />
                )}
                {answer && (
                  <TabButton
                    active={tab === "answer"}
                    onClick={() => setTab("answer")}
                    icon={<MessageSquareText className="size-3.5" />}
                    label="Answer"
                  />
                )}
                <TabButton
                  active={tab === "search"}
                  onClick={() => setTab("search")}
                  icon={<Search className="size-3.5" />}
                  label="Search"
                />
              </div>

              <div className="min-h-0 flex-1">
                {tab === "report" && report ? (
                  <div className="flex h-full">
                    <aside className="w-64 shrink-0 overflow-y-auto border-r">
                      <SectionNav
                        sections={report.sections}
                        selectedId={selectedSection?.id ?? ""}
                        onSelect={selectSection}
                      />
                    </aside>
                    <main className="min-w-0 flex-1 overflow-y-auto">
                      {selectedSection ? (
                        <SectionContent
                          project={project}
                          section={selectedSection}
                          onCiteClick={openCitation}
                          onTopicClick={openTopic}
                          onSuggestionClick={runSuggestion}
                        />
                      ) : (
                        <p className="p-8 text-sm text-muted-foreground">
                          This report has no sections.
                        </p>
                      )}
                    </main>
                  </div>
                ) : tab === "answer" && answer ? (
                  <main className="h-full overflow-y-auto">
                    <SectionContent
                      project={project}
                      section={answer.section}
                      onCiteClick={openCitation}
                      onTopicClick={openTopic}
                      onSuggestionClick={runSuggestion}
                    />
                  </main>
                ) : (
                  <SearchTab
                    project={project}
                    search={search}
                    answerSection={answerSection}
                    onCiteClick={openCitation}
                    onTopicClick={openTopic}
                    onSuggestionClick={runSuggestion}
                  />
                )}
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* RIGHT: selected topic / document information */}
          <ResizablePanel defaultSize={38} minSize={25}>
            <section className="h-full min-w-0">
              <ContextPanel
                project={project}
                selection={selection}
                onOpenCitation={openCitation}
                onOpenTopic={openTopic}
                onOpenPdf={setPdf}
              />
            </section>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <PdfDialog
        project={project}
        request={pdf}
        onOpenChange={(open) => !open && setPdf(null)}
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      onClick={onClick}
      aria-selected={active}
      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function SearchTab({
  project,
  search,
  answerSection,
  onCiteClick,
  onTopicClick,
  onSuggestionClick,
}: {
  project: string;
  search: ReturnType<typeof useVaultSearch>;
  answerSection: Section | null;
  onCiteClick: (uri: string) => void;
  onTopicClick: (key: string, topicKind: "topic" | "outlier") => void;
  onSuggestionClick: (s: string) => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          search.run(search.query);
        }}
        className="flex gap-2 border-b p-4"
      >
        <input
          type="text"
          value={search.query}
          onChange={(e) => search.setQuery(e.target.value)}
          placeholder={`Ask the ${project} wiki…`}
          className="flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          aria-label="Question"
        />
        <Button
          type="submit"
          disabled={search.status === "running" || !search.query.trim()}
        >
          {search.status === "running" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Search className="size-4" />
          )}
          Search
        </Button>
      </form>

      {search.stages.length > 0 && (
        <ol className="space-y-1 border-b px-4 py-3 text-sm">
          {search.stages.map((s) => (
            <li key={s.name} className="flex items-center gap-2">
              {s.status === "running" ? (
                <Spinner className="size-3.5 shrink-0 text-blue-500" />
              ) : (
                <span
                  className={`size-2 shrink-0 rounded-full ${STAGE_DOT[s.status]}`}
                />
              )}
              <span className="text-foreground">{stageLabel(s.name)}</span>
              <span className="text-xs text-muted-foreground">{s.status}</span>
            </li>
          ))}
        </ol>
      )}

      {search.error && (
        <p className="m-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {search.error}
        </p>
      )}

      {answerSection ? (
        <div className="flex-1">
          <div className="flex items-center justify-between gap-2 px-8 pt-6">
            <h2 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <span
                className={`size-2 rounded-full ${STATUS_DOT[search.status]}`}
              />
              Answer
            </h2>
            <Button
              size="sm"
              variant="outline"
              onClick={search.save}
              disabled={search.saving || !!search.saved}
            >
              <Save className="size-3.5" />
              {search.saved
                ? "Saved"
                : search.saving
                  ? "Saving…"
                  : "Save answer"}
            </Button>
          </div>
          {search.saved && (
            <p className="px-8 pt-1 text-xs text-muted-foreground">
              Filed under{" "}
              <a
                href={`/projects/${encodeURIComponent(project)}/answers/${encodeURIComponent(
                  search.saved.replace(/\.ya?ml$/, ""),
                )}`}
                className="font-mono underline hover:text-foreground"
              >
                answers/{search.saved}
              </a>
            </p>
          )}
          <SectionContent
            project={project}
            section={answerSection}
            onCiteClick={onCiteClick}
            onTopicClick={onTopicClick}
            onSuggestionClick={onSuggestionClick}
          />
        </div>
      ) : search.status === "idle" ? (
        <p className="p-8 text-sm text-muted-foreground">
          Ask a question to search the{" "}
          <span className="font-medium">{project}</span> wiki. Answers stream in
          live and can be saved alongside the reports.
        </p>
      ) : null}
    </div>
  );
}
