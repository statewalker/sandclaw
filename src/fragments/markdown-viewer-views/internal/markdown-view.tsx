import { Intents } from "@statewalker/shared-intents";
import { type ReactElement, useEffect, useState } from "react";
import { Markdown } from "@/components/prompt-kit/markdown";
import { runLoadFile } from "@/fragments/files";
import { useAppWorkspace } from "@/fragments/workspace-bridge-views";

interface MarkdownViewProps {
  uri: string;
}

/**
 * Bound to the `markdown-viewer` catalog's `MarkdownView` component
 * type. Lazy-loads the file via `files:load-file` on mount; the
 * spec carries only the URI so SpecStore patches stay cheap.
 */
export function MarkdownView({ uri }: MarkdownViewProps): ReactElement {
  const workspace = useAppWorkspace();
  const intents = workspace.requireAdapter(Intents);

  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; text: string }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    const path = uri.replace(/^file:\/\//, "");
    runLoadFile(intents, { path })
      .promise.then((loaded) => {
        if (cancelled) return;
        const text = new TextDecoder().decode(loaded.bytes);
        setState({ kind: "ready", text });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [uri, intents]);

  if (state.kind === "loading") {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-sm font-medium">Failed to load file</p>
        <p className="text-xs text-muted-foreground">{state.message}</p>
      </div>
    );
  }
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none overflow-auto p-6">
      <Markdown>{state.text}</Markdown>
    </div>
  );
}
