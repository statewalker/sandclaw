import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Markdown } from "./markdown.js";

// `shiki` is a genuine third-party collaborator that loads a wasm
// highlighter. We stub only its `codeToHtml` so the async highlight
// resolves deterministically in jsdom; the behavior under test
// (block/inline classification, block splitting, prop wiring) lives in
// this package, not in shiki.
vi.mock("shiki", () => ({
  codeToHtml: async () => "<pre><code>highlighted</code></pre>",
}));

// All assertions below observe the EFFECTS of the module-private
// `parseMarkdownIntoBlocks` / `extractLanguage` / inline-code heuristic
// through the public <Markdown> component (no private export added).
describe("Markdown (public render)", () => {
  it("renders a heading, paragraph and list from one document", () => {
    const { container, getByText } = render(
      <Markdown>{"# Title\n\nHello world\n\n- one\n- two"}</Markdown>,
    );
    expect(container.querySelector("h1")?.textContent).toBe("Title");
    expect(getByText("Hello world").tagName).toBe("P");
    const items = [...container.querySelectorAll("li")].map((li) => li.textContent);
    expect(items).toEqual(["one", "two"]);
  });

  it("renders a fenced code block with its language class (block branch)", () => {
    const { container } = render(<Markdown>{"```js\nconst a = 1;\n```"}</Markdown>);
    // extractLanguage feeds the CodeBlock; react-markdown tags the code
    // element `language-js`, which the block wrapper carries.
    const block = container.querySelector(".language-js");
    expect(block).toBeTruthy();
    // block branch renders the CodeBlock chrome, not an inline span
    expect(block?.className).toContain("not-prose");
  });

  it("renders inline code as a styled span, distinct from a code block", () => {
    const { container } = render(<Markdown>{"text with `inline` code"}</Markdown>);
    const span = container.querySelector("span.font-mono");
    expect(span?.textContent).toBe("inline");
    // inline path must NOT produce the block chrome
    expect(container.querySelector(".not-prose")).toBeNull();
  });

  it("classifies a multi-line fenced block as a block, not inline", () => {
    const { container } = render(<Markdown>{"```\nline1\nline2\n```"}</Markdown>);
    // no language → plaintext; still the block branch (not-prose chrome)
    expect(container.querySelector(".not-prose")).toBeTruthy();
    expect(container.querySelector("span.font-mono")).toBeNull();
  });

  it("applies the `className` prop to the outer wrapper", () => {
    const { container } = render(<Markdown className="my-markdown">{"hi"}</Markdown>);
    expect(container.querySelector(".my-markdown")).toBeTruthy();
  });

  it("uses a caller-supplied component override via the `components` prop", () => {
    const { getByTestId } = render(
      <Markdown
        components={{
          h1: ({ children }) => <h1 data-testid="custom-h1">{children}</h1>,
        }}
      >
        {"# Overridden"}
      </Markdown>,
    );
    expect(getByTestId("custom-h1").textContent).toBe("Overridden");
  });

  it("routes link hrefs through the `urlTransform` prop", () => {
    const { container } = render(
      <Markdown urlTransform={() => "safe://rewritten"}>
        {"[click](http://example.com/danger)"}
      </Markdown>,
    );
    const anchor = container.querySelector("a");
    expect(anchor?.getAttribute("href")).toBe("safe://rewritten");
    expect(anchor?.textContent).toBe("click");
  });

  it("renders every construct of a multi-block document (parseMarkdownIntoBlocks over many tokens)", () => {
    const { container } = render(<Markdown>{"# H\n\npara\n\n```js\nx\n```\n\n- item"}</Markdown>);
    expect(container.querySelector("h1")).toBeTruthy();
    expect(container.querySelector("p")).toBeTruthy();
    expect(container.querySelector(".language-js")).toBeTruthy();
    expect(container.querySelector("li")).toBeTruthy();
  });
});
