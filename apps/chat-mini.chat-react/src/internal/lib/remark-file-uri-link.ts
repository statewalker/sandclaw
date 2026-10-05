/**
 * Tight regex matching `file://` URIs we want to linkify. Stops at
 * whitespace, common delimiters, and closing brackets/parentheses so
 * trailing punctuation in chat sentences ("Open file:///foo.md.")
 * does not get swallowed into the URI.
 */
const FILE_URI_RE = /file:\/\/[^\s<>()[\]"'`,]+/g;

interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
}

/**
 * Remark plugin that walks `text` AST nodes and replaces `file://`
 * substrings with mdast `link` nodes pointing at the same URI. Skips
 * `code` (fenced) and `inlineCode` nodes by not descending into them
 * — those are emitted by react-markdown as <pre>/<code>/<span> and we
 * want their literal text preserved.
 *
 * Returns a `unified` transformer factory: call once to get the
 * plugin, pass that to `remarkPlugins`. The plugin instance is pure
 * and stateless, so a single shared instance is safe.
 */
export function remarkFileUriLink() {
  return (tree: MdNode): void => {
    walk(tree);
  };
}

function walk(node: MdNode): void {
  if (!node.children || node.children.length === 0) return;
  const next: MdNode[] = [];
  for (const child of node.children) {
    if (child.type === "code" || child.type === "inlineCode") {
      next.push(child);
      continue;
    }
    if (child.type === "text" && typeof child.value === "string") {
      next.push(...splitTextNode(child.value));
      continue;
    }
    walk(child);
    next.push(child);
  }
  node.children = next;
}

function splitTextNode(text: string): MdNode[] {
  const out: MdNode[] = [];
  let lastIndex = 0;
  FILE_URI_RE.lastIndex = 0;
  let match: RegExpExecArray | null = FILE_URI_RE.exec(text);
  while (match) {
    const start = match.index;
    const url = match[0];
    if (start > lastIndex) {
      out.push({ type: "text", value: text.slice(lastIndex, start) });
    }
    out.push({
      type: "link",
      url,
      children: [{ type: "text", value: url }],
    });
    lastIndex = start + url.length;
    match = FILE_URI_RE.exec(text);
  }
  if (out.length === 0) {
    return [{ type: "text", value: text }];
  }
  if (lastIndex < text.length) {
    out.push({ type: "text", value: text.slice(lastIndex) });
  }
  return out;
}
