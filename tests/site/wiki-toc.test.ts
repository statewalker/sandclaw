import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { type Project, Workspace } from "@statewalker/workspace.core";
import { describe, expect, it } from "vitest";
import { parseToc, WikiTopicIndex, wikiTocOf } from "../../src/index.js";

async function makeProject(): Promise<Project> {
  const ws = new Workspace().setFileSystem(new MemFilesApi());
  const project = await ws.getProject("proj", true);
  if (!project) throw new Error("no project");
  return project;
}

const TOC_MD = `# My TOC

## Founders
Who founded the company and when?

## Products
### Flagship
The flagship product and its history.
### Roadmap
Where is the product going next?
`;

describe("parseToc", () => {
  it("parses headings into an ordered tree with per-leaf prompts", () => {
    const entries = parseToc(TOC_MD);
    expect(entries.map((e) => e.title)).toEqual(["Founders", "Products"]);
    expect(entries[0]?.prompt).toBe("Who founded the company and when?");
    expect(entries[0]?.id).toBe("founders");
    // `Products` is a branch with two children, each carrying its own prompt.
    expect(entries[1]?.children?.map((c) => c.title)).toEqual(["Flagship", "Roadmap"]);
    expect(entries[1]?.children?.[0]?.prompt).toBe("The flagship product and its history.");
    expect(entries[1]?.children?.[1]?.prompt).toBe("Where is the product going next?");
  });
});

describe("WikiToc", () => {
  it("round-trips a TOC markdown file and lists it", async () => {
    const project = await makeProject();
    const toc = wikiTocOf(project);

    const path = await toc.write("themes", TOC_MD);
    expect(path).toContain("tocs/themes.md");

    const read = await toc.read("themes");
    expect(read?.markdown).toBe(TOC_MD);
    expect(read?.entries.map((e) => e.title)).toEqual(["Founders", "Products"]);

    const listed: { slug: string; title: string }[] = [];
    for await (const item of toc.list()) listed.push(item);
    expect(listed).toEqual([{ slug: "themes", title: "My TOC" }]);
  });

  it("read() returns undefined for an absent TOC", async () => {
    const project = await makeProject();
    expect(await wikiTocOf(project).read("missing")).toBeUndefined();
  });

  it("suggest() drafts a starter TOC nesting index topics under categories", async () => {
    const project = await makeProject();
    // A category over one index topic, plus a bare root index topic.
    await project.requireAdapter(WikiTopicIndex).write({
      generated: "",
      roots: ["people", "products"],
      nodes: {
        people: {
          kind: "category",
          key: "people",
          name: "People",
          description: "Who is involved.",
          childKeys: ["founders"],
        },
        founders: {
          kind: "topic",
          key: "founders",
          name: "Company founders",
          description: "Who founded it.",
          references: [],
        },
        products: {
          kind: "topic",
          key: "products",
          name: "Products",
          description: "",
          references: [],
        },
      },
    });

    const md = await wikiTocOf(project).suggest();
    const entries = parseToc(md);
    // `People` is a category heading with `Company founders` nested beneath it;
    // `Products` (a bare root index topic) is a top-level heading.
    expect(entries.map((e) => e.title)).toEqual(["People", "Products"]);
    expect(entries[0]?.children?.map((c) => c.title)).toEqual(["Company founders"]);
    expect(entries[0]?.children?.[0]?.prompt).toBe("Who founded it.");
    expect(entries[1]?.prompt).toContain("Products");
  });
});
