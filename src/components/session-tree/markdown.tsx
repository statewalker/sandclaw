import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

export interface MarkdownProps {
  text: string;
  className?: string;
}

export function Markdown({
  text,
  className,
}: MarkdownProps): React.ReactElement {
  return (
    <div
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none break-words",
        // Explicit list styling — defense in depth so lists render
        // correctly even if the @tailwindcss/typography plugin's defaults
        // are overridden somewhere downstream.
        "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6",
        "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6",
        "[&_li]:my-0.5 [&_li>p]:my-0",
        // Nested lists keep their bullet style and tighter spacing.
        "[&_li>ul]:my-1 [&_li>ol]:my-1",
        // Paragraph + heading rhythm.
        "[&_p]:my-2 [&_h1]:mt-3 [&_h2]:mt-3 [&_h3]:mt-2",
        // Inline code and code blocks.
        "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5",
        "[&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:bg-muted [&_pre]:p-3",
        "[&_pre>code]:bg-transparent [&_pre>code]:p-0",
        // Tables (GFM).
        "[&_table]:my-2 [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:px-2 [&_td]:py-1",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}
