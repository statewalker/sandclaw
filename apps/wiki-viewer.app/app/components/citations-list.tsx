import { useEffect, useState } from "react";
import { parseCitationUri } from "@/lib/pages";
import type { CitationBrief } from "@/lib/types";

/** Ordered list of cited document sections (citation order), each clickable. */
export function CitationsList({
  project,
  uris,
  onCiteClick,
}: {
  project: string;
  uris: string[];
  onCiteClick: (uri: string) => void;
}) {
  const [briefs, setBriefs] = useState<Record<string, CitationBrief>>({});
  const urisKey = uris.join("\n");

  useEffect(() => {
    const list = urisKey ? urisKey.split("\n") : [];
    if (list.length === 0) return;
    let cancelled = false;
    const params = new URLSearchParams({ project, uris: JSON.stringify(list) });
    fetch(`/api/citations?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((briefList: CitationBrief[]) => {
        if (cancelled) return;
        setBriefs(Object.fromEntries(briefList.map((b) => [b.uri, b])));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [urisKey, project]);

  if (uris.length === 0) return null;

  return (
    <ol className="space-y-1.5">
      {uris.map((uri, i) => {
        const b = briefs[uri];
        const { file, anchor } = parseCitationUri(uri);
        return (
          <li key={uri}>
            <button
              type="button"
              onClick={() => onCiteClick(uri)}
              className="flex w-full gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
            >
              <span className="shrink-0 text-muted-foreground tabular-nums">
                {i + 1}.
              </span>
              <span className="min-w-0">
                <span className="font-medium">{b?.sectionTitle ?? anchor}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {b?.docTitle ?? file}
                  {b?.docTitle ? (
                    <span className="ml-1.5 font-mono text-[0.65rem] text-muted-foreground/60">
                      {file}
                    </span>
                  ) : null}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
