import type { ReactElement } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownTextProps {
  props: { source: string };
}

/**
 * Bound to the local-models catalog's `Markdown` primitive. Renders the
 * curated model description through `react-markdown` (workbench-native;
 * no dependency on the chat app's renderer). Empty source renders nothing.
 */
export function MarkdownText({ props }: MarkdownTextProps): ReactElement | null {
  if (!props.source) return null;
  return (
    <div className="ai-local-models-markdown text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{props.source}</ReactMarkdown>
    </div>
  );
}
