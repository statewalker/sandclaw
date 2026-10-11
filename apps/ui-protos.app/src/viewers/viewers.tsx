import { Button, cn } from "@statewalker/ui.view.shadcn";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileQuestion,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  MessageSquareText,
  NotebookPen,
  Quote,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { type Citation, type DocBlock, type Sheet, type ViewerFile, viewerFiles } from "./files.js";

export const fileName = (path: string) => path.split("/").at(-1) ?? path;
const folderOf = (path: string) => path.split("/").slice(0, -1).join("/") || "Your folder";
const extension = (path: string) => /\.([^.]+)$/.exec(path)?.[1]?.toLowerCase() ?? "";

const icons = {
  pdf: FileText,
  docx: FileText,
  md: NotebookPen,
  xlsx: FileSpreadsheet,
  image: ImageIcon,
  unsupported: FileQuestion,
};

/** What the shared header and banners need; the body comes as children. */
export interface ViewerFrameProps {
  path: string;
  size?: string;
  icon?: keyof typeof icons;
  /** Read-only files offer "Make a note from this". */
  readOnly?: boolean;
  /** The assistant can't read this file either: no "Ask about this file". */
  noAsk?: boolean;
  /** Next to the file name: the note editor's save status. */
  status?: ReactNode;
  /** Under the header: zoom, pages, editor modes. */
  toolbar?: ReactNode;
  /** Banners above the body (conflict, …). */
  banner?: ReactNode;
  citation?: { question: string };
  onCloseCitation?: () => void;
  children: ReactNode;
}

/** The frame every opened file shares: header, actions, citation banner, then the body. */
export function ViewerFrame({
  path,
  size,
  icon = "pdf",
  readOnly,
  noAsk,
  status,
  toolbar,
  banner,
  citation,
  onCloseCitation,
  children,
}: ViewerFrameProps) {
  const [notice, setNotice] = useState("");
  const Icon = icons[icon];
  const name = fileName(path);
  const action = (label: string, Glyph: typeof X, said: string) => (
    <Button
      variant="ghost"
      size="sm"
      aria-label={label}
      title={label}
      onClick={() => setNotice(said)}
    >
      <Glyph /> <span className="hidden @2xl:inline">{label}</span>
    </Button>
  );
  return (
    <div className="bg-background @container flex h-full min-h-0 w-full min-w-0 flex-col">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2">
        <Icon className="text-muted-foreground size-5 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="truncate text-sm font-medium" title={name}>
            {name}
          </h2>
          <p className="text-muted-foreground truncate text-xs">
            {folderOf(path)}
            {size && ` · ${size}`}
          </p>
        </div>
        {status}
        <div className="flex w-full items-center gap-0.5 @xl:w-auto">
          {!noAsk && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setNotice(`“${name}” is attached to your next question.`)}
            >
              <MessageSquareText /> Ask about this file
            </Button>
          )}
          {readOnly &&
            action(
              "Make a note from this",
              NotebookPen,
              `Created Notes/${name.replace(/\.[^.]+$/, "")} — note.md, linking to this file.`,
            )}
          {action("Show in folder", FolderOpen, "Here the folder zone would reveal the file.")}
          {action("Download", Download, `Downloading ${name}${size ? ` (${size})` : ""}.`)}
        </div>
      </header>
      {notice && (
        <p role="status" className="bg-muted text-muted-foreground border-b px-3 py-1.5 text-xs">
          {notice}
        </p>
      )}
      {citation && (
        <div className="flex items-center gap-2 border-b bg-yellow-100/70 px-3 py-1.5 text-xs dark:bg-yellow-500/15">
          <Quote className="size-3.5 shrink-0" />
          <p className="min-w-0 flex-1">
            Cited in: <span className="font-medium">“{citation.question}”</span>
          </p>
          <Button variant="ghost" size="icon-xs" aria-label="Close" onClick={onCloseCitation}>
            <X />
          </Button>
        </div>
      )}
      {banner}
      {toolbar && (
        <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1">{toolbar}</div>
      )}
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

// ——— Zoom, shared by the PDF and the image ————————————————————————————————

type Zoom = "fit" | number;
const zoomSteps = [50, 75, 100, 125, 150, 200];

function ZoomControls({ zoom, setZoom }: { zoom: Zoom; setZoom: (z: Zoom) => void }) {
  const current = zoom === "fit" ? 100 : zoom;
  const step = (dir: 1 | -1) => {
    const next =
      dir > 0 ? zoomSteps.find((s) => s > current) : zoomSteps.findLast((s) => s < current);
    setZoom(next ?? current);
  };
  return (
    <div className="ml-auto flex items-center gap-0.5">
      <Button variant="ghost" size="icon-sm" aria-label="Zoom out" onClick={() => step(-1)}>
        <ZoomOut />
      </Button>
      {zoom !== "fit" && (
        <span className="w-12 text-center text-xs tabular-nums" aria-live="polite">
          {zoom}%
        </span>
      )}
      <Button variant="ghost" size="icon-sm" aria-label="Zoom in" onClick={() => step(1)}>
        <ZoomIn />
      </Button>
      <Button
        variant={zoom === "fit" ? "secondary" : "ghost"}
        size="sm"
        aria-pressed={zoom === "fit"}
        onClick={() => setZoom("fit")}
      >
        Fit
      </Button>
    </div>
  );
}

// ——— Documents: PDF pages and the DOCX page ———————————————————————————————

/** One block on paper; text sizes follow the page width (container units), so zoom scales them. */
function PaperBlock({ block, cited }: { block: DocBlock; cited: boolean }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (cited) ref.current?.scrollIntoView?.({ block: "center" });
  }, [cited]);
  const mark = cited && "rounded-sm bg-yellow-200/90 outline-2 outline-yellow-300";
  switch (block.kind) {
    case "title":
      return <h3 className="mb-[4cqw] text-center text-[4cqw] font-semibold">{block.text}</h3>;
    case "heading":
      return <h4 className="mt-[3cqw] mb-[1cqw] text-[2.6cqw] font-semibold">{block.text}</h4>;
    case "signature":
      return (
        <p className="mt-[5cqw] inline-block w-1/2 border-t border-neutral-400 pt-[1cqw] text-[2cqw] italic">
          {block.text}
        </p>
      );
    case "text":
      return (
        <p
          ref={ref}
          data-cited={cited || undefined}
          className={cn("mb-[1.5cqw] text-[2.2cqw] leading-relaxed", mark)}
        >
          {block.text}
        </p>
      );
  }
}

function Paper({
  blocks,
  citedId,
  width,
  label,
  long,
}: {
  blocks: DocBlock[];
  citedId?: string;
  /** Pixels, or the available width. */
  width: Zoom;
  label: string;
  /** A Word document flows on: no fixed page height. */
  long?: boolean;
}) {
  return (
    <section
      aria-label={label}
      style={{ width: width === "fit" ? "100%" : `${(width / 100) * 640}px` }}
      className={cn(
        "@container mx-auto shrink-0 bg-white p-[8cqw] font-serif text-neutral-900 shadow-md ring-1 ring-black/5",
        width === "fit" && "max-w-[48rem]",
        long ? "min-h-[141cqw]" : "aspect-[1/1.414]",
      )}
    >
      {blocks.map((b) => (
        <PaperBlock key={b.id} block={b} cited={b.id === citedId} />
      ))}
    </section>
  );
}

/** The shared frame's props, as the viewer fills them for any kind. */
type FrameProps = Omit<ViewerFrameProps, "children" | "toolbar">;

function PdfViewer({
  pages,
  citedId,
  frame,
}: {
  pages: DocBlock[][];
  citedId?: string;
  frame: FrameProps;
}) {
  const citedPage = pages.findIndex((p) => p.some((b) => b.id === citedId));
  const [page, setPage] = useState(Math.max(citedPage, 0));
  const [zoom, setZoom] = useState<Zoom>("fit");
  const toolbar = (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Previous page"
        disabled={page === 0}
        onClick={() => setPage(page - 1)}
      >
        <ChevronLeft />
      </Button>
      <span className="text-xs tabular-nums">
        Page {page + 1} of {pages.length}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Next page"
        disabled={page === pages.length - 1}
        onClick={() => setPage(page + 1)}
      >
        <ChevronRight />
      </Button>
      <ZoomControls zoom={zoom} setZoom={setZoom} />
    </>
  );
  return (
    <ViewerFrame {...frame} toolbar={toolbar}>
      <div className="bg-muted/60 h-full overflow-auto p-4">
        <Paper
          blocks={pages[page] ?? []}
          citedId={citedId}
          width={zoom}
          label={`Page ${page + 1}`}
        />
      </div>
    </ViewerFrame>
  );
}

// ——— Spreadsheet ———————————————————————————————————————————————————————

const columnName = (i: number) => String.fromCharCode(65 + i);
const cellText = (v: string | number | undefined) =>
  typeof v === "number" ? v.toLocaleString("en-GB") : (v ?? "");

function SheetGrid({ sheet }: { sheet: Sheet }) {
  const [selected, setSelected] = useState<[number, number]>([0, 0]);
  const width = Math.max(...sheet.rows.map((r) => r.length), 0) + 2;
  const [r, c] = selected;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-2 py-1 text-xs">
        <span className="bg-muted w-12 rounded px-1.5 py-0.5 text-center font-mono">
          {columnName(c)}
          {r + 1}
        </span>
        <span className="truncate" data-testid="cell-value">
          {cellText(sheet.rows[r]?.[c])}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className="bg-muted sticky top-0 left-0 z-20 w-10 border-r border-b" />
              {Array.from({ length: width }, (_, i) => (
                <th
                  key={columnName(i)}
                  className="bg-muted text-muted-foreground sticky top-0 z-10 min-w-24 border-r border-b px-2 py-1 font-normal"
                >
                  {columnName(i)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: Math.max(sheet.rows.length + 6, 20) }, (_, ri) => (
              <tr key={ri}>
                <th className="bg-muted text-muted-foreground sticky left-0 z-10 border-r border-b px-2 py-1 text-right font-normal">
                  {ri + 1}
                </th>
                {Array.from({ length: width }, (_, ci) => {
                  const v = sheet.rows[ri]?.[ci];
                  const isSelected = ri === r && ci === c;
                  return (
                    // biome-ignore lint/a11y/useKeyWithClickEvents: a pointer nicety; the grid is read-only.
                    <td
                      key={columnName(ci)}
                      onClick={() => setSelected([ri, ci])}
                      className={cn(
                        "border-r border-b px-2 py-1 whitespace-nowrap",
                        typeof v === "number" && "text-right tabular-nums",
                        ri === 0 && "font-semibold",
                        isSelected && "outline-primary outline-2 -outline-offset-2",
                      )}
                    >
                      {cellText(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function XlsxBody({ sheets }: { sheets: Sheet[] }) {
  const [active, setActive] = useState(0);
  const sheet = sheets[active];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">{sheet && <SheetGrid key={sheet.name} sheet={sheet} />}</div>
      <div
        role="tablist"
        aria-label="Sheets"
        className="flex gap-1 overflow-x-auto border-t px-2 py-1"
      >
        {sheets.map((s, i) => (
          <button
            key={s.name}
            type="button"
            role="tab"
            aria-selected={i === active}
            onClick={() => setActive(i)}
            className={cn(
              "rounded-sm px-3 py-1 text-xs whitespace-nowrap",
              i === active ? "bg-secondary font-medium" : "text-muted-foreground hover:bg-accent",
            )}
          >
            {s.name}
          </button>
        ))}
      </div>
    </div>
  );
}

// ——— Image ————————————————————————————————————————————————————————————

/** A drawn stand-in for the photo of the kitchen. */
function KitchenPicture({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 160 120" role="img" aria-label="Photo" className={className} style={style}>
      <rect width="160" height="120" fill="#e9dcc6" />
      <rect y="78" width="160" height="42" fill="#a3825e" />
      <rect x="18" y="20" width="44" height="34" fill="#cfe3ef" stroke="#7b6650" strokeWidth="2" />
      <line x1="40" y1="20" x2="40" y2="54" stroke="#7b6650" strokeWidth="1.5" />
      <rect x="78" y="44" width="70" height="34" fill="#f4f1ea" stroke="#9c8b75" />
      <rect x="78" y="40" width="70" height="5" fill="#6d6259" />
      <rect x="90" y="14" width="46" height="20" fill="#f4f1ea" stroke="#9c8b75" />
      <circle cx="100" cy="60" r="3" fill="#9c8b75" />
      <circle cx="126" cy="60" r="3" fill="#9c8b75" />
      <rect x="0" y="6" width="160" height="5" fill="#7a5a3a" />
    </svg>
  );
}

function ImageViewer({
  width,
  height,
  frame,
}: {
  width: number;
  height: number;
  frame: FrameProps;
}) {
  const [zoom, setZoom] = useState<Zoom>("fit");
  const toolbar = (
    <>
      <span className="text-muted-foreground px-1 text-xs">
        {width} × {height}
      </span>
      <ZoomControls zoom={zoom} setZoom={setZoom} />
    </>
  );
  return (
    <ViewerFrame {...frame} toolbar={toolbar}>
      <div
        className={cn(
          "bg-muted/60 h-full overflow-auto p-4",
          zoom === "fit" && "grid place-items-center",
        )}
      >
        {zoom === "fit" ? (
          <KitchenPicture className="max-h-full max-w-full shadow-md" />
        ) : (
          <KitchenPicture
            className="max-w-none shadow-md"
            style={{ width: (width * zoom) / 100, height: (height * zoom) / 100 }}
          />
        )}
      </div>
    </ViewerFrame>
  );
}

// ——— Unsupported, loading ——————————————————————————————————————————————

function Unsupported({ path }: { path: string }) {
  const [notice, setNotice] = useState("");
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <FileQuestion className="text-muted-foreground size-10" />
      <h3 className="font-medium">Can't show .{extension(path)} files</h3>
      <p className="text-muted-foreground max-w-sm text-sm">
        Sandclaw can't display this kind of file, and the assistant can't read it. Open it with the
        program that made it.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={() => setNotice(`Downloading ${fileName(path)}.`)}>
          <Download /> Download
        </Button>
        <Button
          variant="outline"
          onClick={() => setNotice("Here the folder zone would reveal the file.")}
        >
          <FolderOpen /> Show in folder
        </Button>
      </div>
      {notice && (
        <p role="status" className="text-muted-foreground text-xs">
          {notice}
        </p>
      )}
    </div>
  );
}

function Loading({ size, progress }: { size: string; progress: number }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <Loader2 className="text-muted-foreground size-8 animate-spin" />
      <p className="text-sm font-medium">Opening… {progress}%</p>
      <div
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Opening the file"
        className="bg-muted h-1.5 w-56 max-w-full overflow-hidden rounded-full"
      >
        <div className="bg-primary h-full" style={{ width: `${progress}%` }} />
      </div>
      <p className="text-muted-foreground max-w-xs text-xs">
        This file is large ({size}); it can take a minute. You can keep working meanwhile.
      </p>
    </div>
  );
}

// ——— The viewer ————————————————————————————————————————————————————————

export interface FileViewerProps {
  /** A path in the mock files; anything else is shown as unsupported. */
  path: string;
  /** Opened from an answer: the banner, and the cited passage highlighted. */
  citation?: Citation;
  /** Still opening: the progress, in percent. */
  loading?: number;
}

function Opened({ file, citation }: { file: ViewerFile; citation?: Citation }) {
  const [cited, setCited] = useState(citation);
  const frame: FrameProps = {
    path: file.path,
    size: file.size,
    icon: file.kind,
    readOnly: true,
    noAsk: file.kind === "unsupported",
    citation: cited,
    onCloseCitation: () => setCited(undefined),
  };
  switch (file.kind) {
    case "pdf":
      return <PdfViewer pages={file.pages} citedId={cited?.blockId} frame={frame} />;
    case "image":
      return <ImageViewer width={file.width} height={file.height} frame={frame} />;
    case "docx":
      return (
        <ViewerFrame {...frame}>
          <div className="bg-muted/60 h-full overflow-auto p-4">
            <Paper
              blocks={file.blocks}
              citedId={cited?.blockId}
              width="fit"
              label="Document"
              long
            />
          </div>
        </ViewerFrame>
      );
    case "xlsx":
      return (
        <ViewerFrame {...frame}>
          <XlsxBody sheets={file.sheets} />
        </ViewerFrame>
      );
    case "unsupported":
      return (
        <ViewerFrame {...frame}>
          <Unsupported path={file.path} />
        </ViewerFrame>
      );
  }
}

/** A read-only file opened in a tab: PDF, DOCX, XLSX, image, or "can't show". */
export function FileViewer({ path, citation, loading }: FileViewerProps) {
  const file = viewerFiles[path] ?? { kind: "unsupported", path, size: "" };
  if (loading !== undefined)
    return (
      <ViewerFrame path={path} size={file.size} icon={file.kind} readOnly>
        <Loading size={file.size} progress={loading} />
      </ViewerFrame>
    );
  return <Opened key={path} file={file} citation={citation} />;
}
