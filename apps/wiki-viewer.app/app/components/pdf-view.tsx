// Type-only: erased at compile time, so it doesn't pull the WASM viewer into SSR.
import type { ZoomMode } from "@embedpdf/react-pdf-viewer";
import { Loader2 } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";

// pdfium runs as WASM in the browser, so the viewer must not be server-rendered.
// `lazy` keeps it out of the SSR bundle; the `mounted` gate below keeps it out
// of the island's first (hydration) render so client markup matches the server.
const LazyPDFViewer = lazy(() =>
  import("@embedpdf/react-pdf-viewer").then((m) => ({ default: m.PDFViewer })),
);

function Spinner() {
  return (
    <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> Loading viewer…
    </div>
  );
}

/**
 * Embedded EmbedPDF viewer for one source PDF, scrolled to `page` on load.
 * Reused both inline (right panel) and full-screen (dialog). Keyed by src so a
 * new document remounts and the initial-load scroll fires again.
 */
export function PdfView({
  project,
  file,
  page,
  style,
  className,
}: {
  project: string;
  file: string;
  page: number;
  style?: React.CSSProperties;
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return <Spinner />;

  const src = `/api/pdf?project=${encodeURIComponent(project)}&file=${encodeURIComponent(file)}`;
  return (
    <Suspense fallback={<Spinner />}>
      <LazyPDFViewer
        key={src}
        className={className}
        style={style ?? { width: "100%", height: "100%" }}
        // Open fitted to the panel width by default.
        config={{ src, zoom: { defaultZoomLevel: "fit-width" as ZoomMode } }}
        onReady={(registry) => {
          const scroll = registry.getPlugin("scroll")?.provides?.();
          scroll?.onLayoutReady(
            (e: { documentId: string; isInitial: boolean }) => {
              if (e.isInitial) {
                scroll
                  .forDocument(e.documentId)
                  .scrollToPage({ pageNumber: page, behavior: "instant" });
              }
            },
          );
        }}
      />
    </Suspense>
  );
}
