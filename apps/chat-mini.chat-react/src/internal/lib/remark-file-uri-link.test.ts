import { describe, expect, it } from "vitest";
import { remarkFileUriLink } from "./remark-file-uri-link.js";

interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
}

function makeText(value: string): MdNode {
  return { type: "text", value };
}

describe("remarkFileUriLink", () => {
  it("replaces a file:// URI inside a text node with a link node", () => {
    const tree: MdNode = {
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [makeText("Open file:///abs/path/to/foo.md please.")],
        },
      ],
    };
    remarkFileUriLink()(tree);

    const para = tree.children?.[0];
    expect(para?.children?.length).toBe(3);
    expect(para?.children?.[0]).toEqual({ type: "text", value: "Open " });
    expect(para?.children?.[1]).toEqual({
      type: "link",
      url: "file:///abs/path/to/foo.md",
      children: [{ type: "text", value: "file:///abs/path/to/foo.md" }],
    });
    expect(para?.children?.[2]).toEqual({ type: "text", value: " please." });
  });

  it("leaves text without file:// URIs untouched", () => {
    const tree: MdNode = {
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [makeText("nothing to see here")],
        },
      ],
    };
    remarkFileUriLink()(tree);
    const para = tree.children?.[0];
    expect(para?.children?.length).toBe(1);
    expect(para?.children?.[0]).toEqual({
      type: "text",
      value: "nothing to see here",
    });
  });

  it("does NOT rewrite text inside fenced code blocks", () => {
    const code: MdNode = {
      type: "code",
      value: "file:///foo.md",
    };
    const tree: MdNode = {
      type: "root",
      children: [code],
    };
    remarkFileUriLink()(tree);
    expect(tree.children?.[0]).toBe(code);
    expect(code.value).toBe("file:///foo.md");
  });

  it("does NOT rewrite text inside inline code spans", () => {
    const inlineCode: MdNode = {
      type: "inlineCode",
      value: "file:///foo.md",
    };
    const tree: MdNode = {
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [inlineCode],
        },
      ],
    };
    remarkFileUriLink()(tree);
    const para = tree.children?.[0];
    expect(para?.children?.[0]).toBe(inlineCode);
    expect(inlineCode.value).toBe("file:///foo.md");
  });

  it("handles multiple URIs in one text node", () => {
    const tree: MdNode = {
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [makeText("see file:///a.md and file:///b.md")],
        },
      ],
    };
    remarkFileUriLink()(tree);
    const para = tree.children?.[0];
    expect(para?.children?.length).toBe(4);
    expect(para?.children?.[1]?.url).toBe("file:///a.md");
    expect(para?.children?.[3]?.url).toBe("file:///b.md");
  });
});
