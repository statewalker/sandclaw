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
        // The typography plugin defaults `--tw-prose-pre-bg` to a near-
        // black colour and `--tw-prose-pre-code` to near-white — fine
        // when you accept its dark-themed code block, but unreadable
        // once we override `pre` with our light `bg-muted` token. Pin
        // both code/pre colours to our theme tokens so contrast is
        // correct in both light and dark modes (the dark variant of
        // `--foreground` / `--muted` is set up the same way).
        "[--tw-prose-code:var(--foreground)]",
        "[--tw-prose-pre-code:var(--foreground)]",
        "[--tw-prose-pre-bg:var(--muted)]",
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
        // Inline code and code blocks. The text-foreground here is a
        // belt-and-braces backup to the prose-var overrides above.
        "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-foreground",
        "[&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:text-foreground",
        "[&_pre>code]:bg-transparent [&_pre>code]:p-0 [&_pre>code]:text-foreground",
        // Tables (GFM).
        "[&_table]:my-2 [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:px-2 [&_td]:py-1",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}
