import {
  Button,
  Card,
  cn,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@statewalker/ui.view.shadcn";
import { ArrowLeft, ChevronDown, ChevronRight, FileText, Search, Tag } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  block,
  countByIndex,
  coverage,
  documents,
  filterByIndex,
  type IndexKind,
  indexKinds,
  indexWords,
  type MergedResult,
  mergeHits,
  searchIndexes,
  sectionOf,
  type Topic,
  tableOfContents,
  topics,
} from "./explore-model.js";

export const fileName = (path: string) => path.split("/").at(-1) ?? path;
export const score = (n: number) => n.toFixed(2);

/** "Words #2": which index found a passage, and where it ranked there. */
export function IndexTag({ index, rank }: { index: IndexKind; rank?: number }) {
  return (
    <span className="bg-secondary inline-flex items-center rounded-full px-2 py-0.5 text-xs whitespace-nowrap">
      {indexWords[index].label}
      {rank !== undefined && <span className="text-muted-foreground ml-1">#{rank}</span>}
    </span>
  );
}

type OnOpen = (path: string, blockId?: string) => void;

/** A passage: file, section, a short quote; opens the document there. */
function PassageButton({
  path,
  blockId,
  onOpen,
  showFile = true,
}: {
  path: string;
  blockId: string;
  onOpen: OnOpen;
  showFile?: boolean;
}) {
  const section = sectionOf(path, blockId);
  return (
    <button
      type="button"
      onClick={() => onOpen(path, blockId)}
      className="hover:bg-muted/60 flex w-full min-w-0 flex-col rounded px-2 py-1 text-left text-xs"
    >
      <span className="truncate font-medium">
        {showFile ? `${fileName(path)}${section ? ` · ${section}` : ""}` : section || "Start"}
      </span>
      <span className="text-muted-foreground line-clamp-1">{block(path, blockId)?.text}</span>
    </button>
  );
}

// --- (1) Topics ------------------------------------------------------------------

function TopicNode({ topic, depth, onOpen }: { topic: Topic; depth: number; onOpen: OnOpen }) {
  const [open, setOpen] = useState(depth < 2 && !topic.covers);
  const docs = coverage(topic);
  const passages = docs.reduce((n, d) => n + d.blockIds.length, 0);
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="hover:bg-accent flex w-full min-w-0 items-center gap-1.5 rounded px-1.5 py-1 text-left text-sm"
      >
        {open ? (
          <ChevronDown className="text-muted-foreground size-4 shrink-0" />
        ) : (
          <ChevronRight className="text-muted-foreground size-4 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate font-medium">{topic.name}</span>
        <span className="text-muted-foreground shrink-0 text-xs">
          {docs.length} doc{docs.length > 1 ? "s" : ""} · {passages} section
          {passages > 1 ? "s" : ""}
        </span>
      </button>
      {open && (
        <div className="ml-3 border-l pl-2">
          {topic.children ? (
            <ul>
              {topic.children.map((c) => (
                <TopicNode key={c.name} topic={c} depth={depth + 1} onOpen={onOpen} />
              ))}
            </ul>
          ) : (
            <ul className="grid gap-2 py-1">
              {docs.map((d) => (
                <li key={d.path} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => onOpen(d.path)}
                    className="flex max-w-full min-w-0 items-center gap-1.5 px-2 text-xs font-medium hover:underline"
                  >
                    <FileText className="size-3.5 shrink-0" />
                    <span className="truncate">{fileName(d.path)}</span>
                  </button>
                  {d.blockIds.map((id) => (
                    <PassageButton
                      key={id}
                      path={d.path}
                      blockId={id}
                      onOpen={onOpen}
                      showFile={false}
                    />
                  ))}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

export function TopicTree({ onOpen }: { onOpen: OnOpen }) {
  return (
    <ul aria-label="Topics" className="grid gap-0.5">
      {topics.map((t) => (
        <TopicNode key={t.name} topic={t} depth={0} onOpen={onOpen} />
      ))}
    </ul>
  );
}

// --- (2) A document's table of contents --------------------------------------------

export function DocumentContents({
  path,
  focus,
  onPick,
  onOpen,
}: {
  path: string;
  /** The passage opened from a topic or a result: its section is marked. */
  focus?: string;
  onPick?: (path: string) => void;
  onOpen: OnOpen;
}) {
  return (
    <div className="grid min-w-0 gap-3">
      {onPick && (
        <Select value={path} onValueChange={onPick}>
          <SelectTrigger aria-label="Document" className="w-full min-w-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.keys(documents).map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <ol aria-label={`Contents of ${fileName(path)}`} className="grid gap-1">
        {tableOfContents(path).map((s, i) => (
          <li
            key={s.blockIds[0]}
            className={cn(
              "rounded-md border p-2",
              focus && s.blockIds.includes(focus) && "border-primary bg-primary/5",
            )}
          >
            <button
              type="button"
              onClick={() => onOpen(path, s.blockIds[0])}
              className="flex w-full min-w-0 items-baseline gap-2 text-left text-sm hover:underline"
            >
              <span className="text-muted-foreground w-4 shrink-0 text-xs tabular-nums">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 font-medium break-words">
                {s.heading || "(before the first heading)"}
              </span>
              <span className="text-muted-foreground shrink-0 text-xs">
                {s.blockIds.length} passage{s.blockIds.length > 1 ? "s" : ""}
              </span>
            </button>
            <p className="text-muted-foreground mt-1 ml-6 line-clamp-2 text-xs">
              {block(path, s.blockIds[0] ?? "")?.text}
            </p>
            <div className="mt-1 ml-6 flex flex-wrap gap-1">
              {s.topics.length === 0 ? (
                <span className="text-muted-foreground text-xs italic">No topic</span>
              ) : (
                s.topics.map((t) => (
                  <span
                    key={t}
                    title={t}
                    className="bg-secondary inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs"
                  >
                    <Tag className="size-3 shrink-0" />
                    <span className="truncate">{t.split(" ▸ ").slice(-2).join(" ▸ ")}</span>
                  </span>
                ))
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// --- (3) Search, tagged by index ---------------------------------------------------

function ResultRow({
  result,
  rank,
  onOpen,
}: {
  result: MergedResult;
  rank: number;
  onOpen: OnOpen;
}) {
  const [why, setWhy] = useState(false);
  return (
    <li className="grid gap-1 border-b py-2 last:border-b-0">
      <div className="flex min-w-0 items-start gap-2">
        <span className="text-muted-foreground w-5 shrink-0 pt-1 text-xs tabular-nums">{rank}</span>
        <div className="min-w-0 flex-1">
          <PassageButton path={result.path} blockId={result.blockId} onOpen={onOpen} />
          <div className="flex flex-wrap items-center gap-1 px-2 pt-1">
            {result.foundBy.map((f) => (
              <IndexTag key={f.index} index={f.index} rank={f.rank} />
            ))}
            <button
              type="button"
              aria-expanded={why}
              onClick={() => setWhy(!why)}
              className="text-muted-foreground ml-auto text-xs hover:underline"
            >
              {why ? "Hide why" : "Why?"}
            </button>
          </div>
          {why && (
            <ul className="text-muted-foreground mx-2 mt-1 grid gap-0.5 border-l pl-2 text-xs">
              {result.foundBy.map((f) => (
                <li key={f.index}>
                  <span className="text-foreground">{indexWords[f.index].label}</span> #{f.rank} ·
                  score {score(f.score)} · {f.explain}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}

export function IndexSearch({
  query: initialQuery = "",
  only: initialOnly = "all",
  onOpen,
  empty,
}: {
  query?: string;
  only?: IndexKind | "all";
  onOpen: OnOpen;
  /** Shown while the query is empty. */
  empty?: ReactNode;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [only, setOnly] = useState<IndexKind | "all">(initialOnly);
  const all = mergeHits(searchIndexes(query));
  const counts = countByIndex(all);
  const shown = filterByIndex(all, only);

  const chip = (value: IndexKind | "all", label: string, count: number) => (
    <button
      key={value}
      type="button"
      aria-pressed={only === value}
      onClick={() => setOnly(value)}
      className={cn(
        "rounded-full border px-3 py-1 text-xs",
        only === value ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent",
      )}
    >
      {label} {count}
    </button>
  );

  return (
    <div className="grid min-w-0 gap-3">
      <div className="relative">
        <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
        <Input
          aria-label="Search the indexes"
          placeholder="Search words, meaning, topics, headings"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8"
        />
      </div>
      {query.trim() && (
        <fieldset className="flex flex-wrap gap-2" aria-label="Found by">
          {chip("all", "All", all.length)}
          {indexKinds.map((k) => chip(k, indexWords[k].label, counts[k]))}
        </fieldset>
      )}
      {!query.trim() ? (
        empty
      ) : shown.length === 0 ? (
        <p className="text-muted-foreground p-6 text-center text-sm">
          {all.length === 0
            ? `No index found anything for “${query.trim()}”.`
            : `The ${indexWords[only as IndexKind].label} index found nothing for “${query.trim()}”.`}
        </p>
      ) : (
        <ol aria-label="Results">
          {shown.map((r, i) => (
            <ResultRow key={`${r.path}#${r.blockId}`} result={r} rank={i + 1} onOpen={onOpen} />
          ))}
        </ol>
      )}
    </div>
  );
}

// --- The explorer ------------------------------------------------------------------

/**
 * - `tabs`: Topics | Contents | Search, each a tab; opening a passage shows its document's contents;
 * - `search-first`: one page, the search on top; with no query, the topics below it.
 */
export type ExploreVariant = "tabs" | "search-first";
export type ExploreTab = "topics" | "contents" | "search";

export interface IndexExplorerProps {
  variant?: ExploreVariant;
  tab?: ExploreTab;
  query?: string;
  only?: IndexKind | "all";
  /** The document shown in Contents. */
  path?: string;
  /** Called when a document or passage is opened (here it also shows its contents). */
  onOpen?: OnOpen;
}

const firstDoc = "Clients/Dupont — offer.docx";

export function IndexExplorer({
  variant = "tabs",
  tab: initialTab = "topics",
  query,
  only,
  path: initialPath,
  onOpen,
}: IndexExplorerProps) {
  const [tab, setTab] = useState<ExploreTab>(initialTab);
  const [doc, setDoc] = useState<{ path: string; focus?: string } | undefined>(
    initialPath ? { path: initialPath } : undefined,
  );
  const open: OnOpen = (path, blockId) => {
    setDoc({ path, focus: blockId });
    setTab("contents");
    onOpen?.(path, blockId);
  };

  const header = (
    <div className="grid gap-0.5">
      <h2 className="font-semibold">What the indexes know</h2>
      <p className="text-muted-foreground text-xs">
        Built on this computer from your folder: words, meaning, topics and headings.
      </p>
    </div>
  );

  if (variant === "search-first") {
    return (
      <Card className="w-full max-w-2xl gap-3 p-4">
        {header}
        {doc && (
          <div className="grid gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="justify-self-start"
              onClick={() => setDoc(undefined)}
            >
              <ArrowLeft /> Back
            </Button>
            <h3 className="truncate text-sm font-medium">{fileName(doc.path)}</h3>
            <DocumentContents path={doc.path} focus={doc.focus} onOpen={open} />
          </div>
        )}
        {/* Kept mounted while a document is open, so Back returns to the same search. */}
        <div hidden={!!doc}>
          <IndexSearch
            query={query}
            only={only}
            onOpen={open}
            empty={
              <section className="grid gap-1">
                <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  Or browse by topic
                </h3>
                <TopicTree onOpen={open} />
              </section>
            }
          />
        </div>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl gap-3 p-4">
      {header}
      <Tabs value={tab} onValueChange={(v) => setTab(v as ExploreTab)} className="min-w-0">
        <TabsList className="w-full">
          <TabsTrigger value="topics">Topics</TabsTrigger>
          <TabsTrigger value="contents">Contents</TabsTrigger>
          <TabsTrigger value="search">Search</TabsTrigger>
        </TabsList>
        <TabsContent value="topics">
          <TopicTree onOpen={open} />
        </TabsContent>
        <TabsContent value="contents">
          <DocumentContents
            path={doc?.path ?? firstDoc}
            focus={doc?.focus}
            onPick={(path) => setDoc({ path })}
            onOpen={(path, blockId) => onOpen?.(path, blockId)}
          />
        </TabsContent>
        <TabsContent value="search">
          <IndexSearch query={query} only={only} onOpen={open} />
        </TabsContent>
      </Tabs>
    </Card>
  );
}
