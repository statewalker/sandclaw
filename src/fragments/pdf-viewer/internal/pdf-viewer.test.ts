import { Slots } from "@statewalker/shared-slots";
import { Workspace } from "@statewalker/workspace-api";
import { describe, expect, it } from "vitest";
import type { MimeRenderer } from "@/fragments/files";
import initPdfViewer, {
  PDF_VIEWER_CATALOG_ID,
  pdfViewerPanelId,
  pdfViewerSpecId,
} from "../index.js";

describe("pdf-viewer init", () => {
  it("contributes an application/pdf MimeRenderer with deterministic ids", async () => {
    const ws = new Workspace();
    const slots = ws.requireAdapter(Slots);
    const ctx: Record<string, unknown> = { "workspace:workspace": ws };

    const cleanup = initPdfViewer(ctx);

    const snapshot = slots.getSnapshot<MimeRenderer>("files:mime-renderers");
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]?.mimeTypePattern).toBe("application/pdf");

    const plan = snapshot[0]?.buildPanel("/x/y.pdf");
    expect(plan?.catalogId).toBe(PDF_VIEWER_CATALOG_ID);
    expect(plan?.panelId).toBe(pdfViewerPanelId("/x/y.pdf"));
    expect(plan?.specId).toBe(pdfViewerSpecId("/x/y.pdf"));

    const planAgain = snapshot[0]?.buildPanel("/x/y.pdf");
    expect(planAgain?.panelId).toBe(plan?.panelId);
    expect(planAgain?.specId).toBe(plan?.specId);

    await cleanup();
  });

  it("removes the contribution on cleanup", async () => {
    const ws = new Workspace();
    const slots = ws.requireAdapter(Slots);
    const ctx: Record<string, unknown> = { "workspace:workspace": ws };

    const cleanup = initPdfViewer(ctx);
    expect(
      slots.getSnapshot<MimeRenderer>("files:mime-renderers"),
    ).toHaveLength(1);
    await cleanup();
    expect(
      slots.getSnapshot<MimeRenderer>("files:mime-renderers"),
    ).toHaveLength(0);
  });
});
