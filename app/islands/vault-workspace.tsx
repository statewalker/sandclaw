import { ChevronLeft, FileText, Loader2, Save, Search } from "lucide-react";
import { useState } from "react";
import { ClientOnly } from "@/components/client-only";
import {
  ContextPanel,
  type ContextSelection,
} from "@/components/context-panel";
import { PdfDialog } from "@/components/pdf-dialog";
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
import type { PdfRequest, ReportSetInfo, Section } from "@/lib/types";

export interface VaultReport {
  name: string;
  sections: Section[];
}

interface WorkspaceProps {
  project: string;
  report: VaultReport | null;
  allSets: ReportSetInfo[];
  initialTab: "report" | "search";
}

const STATUS_DOT: Record<SearchStatus, string> = {
  idle: "bg-muted-foreground/30",
  running: "bg-blue-500 animate-pulse",
  done: "bg-emerald-500",
  error: "bg-destructive",
};
const STAGE_DOT: Record<string, string> = {
  pending: "bg-muted-foreground/30",
  running: "bg-blue-500 animate-pulse",
  done: "bg-emerald-500",
  skipped: "bg-muted-foreground/40",
  failed: "bg-destructive",
};

/** Human-readable label per query stage type. */
const STAGE_LABELS: Record<string, string> = {
  intentDetection: "Intent detection",
  globalTopicSelection: "Global topic selection",
  docTopicClustering: "Doc topic clustering",
  summarize: "Topics summarization",
  responseCompose: "Response composing",
  sourceVerify: "Source verification",
  response: "Response",
  negativeResponse: "Response",
};

function stageLabel(type: string): string {
  if (STAGE_LABELS[type]) return STAGE_LABELS[type];
  const spaced = type.replace(/([A-Z])/g, " $1").trim();
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
  allSets,
  initialTab,
}: WorkspaceProps) {
  const hasReport = report !== null;
  const [tab, setTab] = useState<"report" | "search">(
    hasReport ? initialTab : "search",
  );
  const [selection, setSelection] = useState<ContextSelection | null>(null);
  const [pdf, setPdf] = useState<PdfRequest | null>(null);
  const [selectedId, setSelectedId] = useState(report?.sections[0]?.id ?? "");
  const search = useVaultSearch(project);

  const currentIndex = allSets.findIndex(
    (s) => s.project === project && s.name === report?.name,
  );

  const openCitation = (uri: string) => setSelection({ kind: "citation", uri });
  const openTopic = (key: string, topicKind: "topic" | "outlier") =>
    setSelection({ kind: "topic", key, topicKind });
  const selectSection = (id: string) => {
    setSelectedId(id);
    setSelection(null); // context is per-section; reset on navigation
  };
  // A clicked retrieval suggestion pre-fills the query, flips to the Search
  // tab, and runs the search in the current vault.
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
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
        <a
          href="/"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Home
        </a>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium">{project}</span>
        <span className="text-muted-foreground">/</span>
        <select
          value={currentIndex}
          onChange={(e) => {
            const s = allSets[Number(e.target.value)];
            if (s) {
              window.location.assign(
                `/r/${encodeURIComponent(s.project)}/${encodeURIComponent(s.name)}`,
              );
            }
          }}
          className="rounded-md border bg-background px-2 py-1 text-sm font-medium"
          aria-label="Report"
        >
          <option value={-1} disabled>
            Select a report…
          </option>
          {allSets.map((s, i) => (
            <option key={`${s.project}/${s.name}`} value={i}>
              {s.project} / {s.name}
            </option>
          ))}
        </select>
      </header>

      <div className="flex min-h-0 flex-1">
        <ResizablePanelGroup className="min-h-0 flex-1">
          {/* LEFT: tabbed panel — Report (TOC + content) or Search */}
          <ResizablePanel defaultSize={62} minSize={35}>
            <div className="flex h-full flex-col">
              <div className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5">
                <TabButton
                  active={tab === "report"}
                  disabled={!hasReport}
                  onClick={() => setTab("report")}
                  icon={<FileText className="size-3.5" />}
                  label="Report"
                />
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
  disabled,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      disabled={disabled}
      onClick={onClick}
      aria-selected={active}
      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
      } disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent`}
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
            <li
              key={`${s.type}:${s.startedAt ?? "pending"}`}
              className="flex items-center gap-2"
            >
              {s.status === "running" ? (
                <Spinner className="size-3.5 shrink-0 text-blue-500" />
              ) : (
                <span
                  className={`size-2 shrink-0 rounded-full ${STAGE_DOT[s.status]}`}
                />
              )}
              <span className="text-foreground">{stageLabel(s.type)}</span>
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
              Filed as <code className="font-mono">answers/{search.saved}</code>
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
