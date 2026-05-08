import { Slots } from "@statewalker/shared-slots";
import { Workspace } from "@statewalker/workspace-api";
import { describe, expect, it } from "vitest";
import type { MimeRenderer } from "@/fragments/files";
import initMarkdownViewer, {
  MARKDOWN_VIEWER_CATALOG_ID,
  markdownViewerPanelId,
  markdownViewerSpecId,
} from "../index.js";

describe("markdown-viewer init", () => {
  it("contributes a text/markdown MimeRenderer with deterministic ids", async () => {
    const ws = new Workspace();
    const slots = ws.requireAdapter(Slots);
    const ctx: Record<string, unknown> = { "workspace:workspace": ws };

    const cleanup = initMarkdownViewer(ctx);

    const snapshot = slots.getSnapshot<MimeRenderer>("files:mime-renderers");
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]?.mimeTypePattern).toBe("text/markdown");

    const plan = snapshot[0]?.buildPanel("/note.md");
    expect(plan?.catalogId).toBe(MARKDOWN_VIEWER_CATALOG_ID);
    expect(plan?.panelId).toBe(markdownViewerPanelId("/note.md"));
    expect(plan?.specId).toBe(markdownViewerSpecId("/note.md"));
    expect(plan?.spec).toMatchObject({
      root: "panel",
      elements: { panel: { type: "MarkdownView", props: { uri: "/note.md" } } },
    });

    await cleanup();
  });

  it("removes the contribution on cleanup", async () => {
    const ws = new Workspace();
    const slots = ws.requireAdapter(Slots);
    const ctx: Record<string, unknown> = { "workspace:workspace": ws };

    const cleanup = initMarkdownViewer(ctx);
    expect(
      slots.getSnapshot<MimeRenderer>("files:mime-renderers"),
    ).toHaveLength(1);
    await cleanup();
    expect(
      slots.getSnapshot<MimeRenderer>("files:mime-renderers"),
    ).toHaveLength(0);
  });
});
