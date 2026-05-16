import { cn } from "@statewalker/shadcn-react";
import { marked } from "marked";
import { type ComponentProps, memo, useId, useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { CodeBlock, CodeBlockCode } from "./code-block";

type PluggableList = NonNullable<
  ComponentProps<typeof ReactMarkdown>["remarkPlugins"]
>;
type UrlTransform = NonNullable<
  ComponentProps<typeof ReactMarkdown>["urlTransform"]
>;

export type MarkdownProps = {
  children: string;
  id?: string;
  className?: string;
  components?: Partial<Components>;
  /** Extra remark plugins appended to the defaults (`remarkGfm`, `remarkBreaks`). */
  remarkPlugins?: PluggableList;
  /** Custom URL transform; defaults to identity (no sanitization beyond ReactMarkdown's). */
  urlTransform?: UrlTransform;
};

function parseMarkdownIntoBlocks(markdown: string): string[] {
  const tokens = marked.lexer(markdown);
  return tokens.map((token) => token.raw);
}

function extractLanguage(className?: string): string {
  if (!className) return "plaintext";
  const match = className.match(/language-(\w+)/);
  return match?.[1] ?? "plaintext";
}

const INITIAL_COMPONENTS: Partial<Components> = {
  code: function CodeComponent({ className, children, ...props }) {
    const isInline =
      !props.node?.position?.start.line ||
      props.node?.position?.start.line === props.node?.position?.end.line;

    if (isInline) {
      return (
        <span
          className={cn(
            "bg-primary-foreground rounded-sm px-1 font-mono text-sm",
            className,
          )}
          {...props}
        >
          {children}
        </span>
      );
    }

    const language = extractLanguage(className);

    return (
      <CodeBlock className={className}>
        <CodeBlockCode code={children as string} language={language} />
      </CodeBlock>
    );
  },
  pre: function PreComponent({ children }) {
    return <>{children}</>;
  },
};

const MemoizedMarkdownBlock = memo(
  function MarkdownBlock({
    content,
    components,
    remarkPlugins,
    urlTransform,
  }: {
    content: string;
    components: Partial<Components>;
    remarkPlugins: PluggableList;
    urlTransform: UrlTransform | undefined;
  }) {
    return (
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        components={components}
        urlTransform={urlTransform}
      >
        {content}
      </ReactMarkdown>
    );
  },
  function propsAreEqual(prevProps, nextProps) {
    return (
      prevProps.content === nextProps.content &&
      prevProps.components === nextProps.components &&
      prevProps.remarkPlugins === nextProps.remarkPlugins &&
      prevProps.urlTransform === nextProps.urlTransform
    );
  },
);

MemoizedMarkdownBlock.displayName = "MemoizedMarkdownBlock";

function MarkdownComponent({
  children,
  id,
  className,
  components,
  remarkPlugins,
  urlTransform,
}: MarkdownProps) {
  const generatedId = useId();
  const blockId = id ?? generatedId;
  const blocks = useMemo(() => parseMarkdownIntoBlocks(children), [children]);
  const mergedComponents = useMemo<Partial<Components>>(
    () => ({ ...INITIAL_COMPONENTS, ...components }),
    [components],
  );
  const mergedPlugins = useMemo<PluggableList>(
    () => [remarkGfm, remarkBreaks, ...(remarkPlugins ?? [])],
    [remarkPlugins],
  );

  return (
    <div className={className}>
      {blocks.map((block, index) => (
        <MemoizedMarkdownBlock
          key={`${blockId}-block-${index}`}
          content={block}
          components={mergedComponents}
          remarkPlugins={mergedPlugins}
          urlTransform={urlTransform}
        />
      ))}
    </div>
  );
}

const Markdown = memo(MarkdownComponent);
Markdown.displayName = "Markdown";

export { Markdown };
