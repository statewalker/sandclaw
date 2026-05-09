import { Slots } from "@statewalker/shared-slots";
import { Workspace } from "@statewalker/workspace-api";
import { describe, expect, it } from "vitest";
import type { MimeRenderer } from "@/fragments/files";
import initImageViewer, {
  IMAGE_VIEWER_CATALOG_ID,
  imageViewerPanelId,
  imageViewerSpecId,
} from "../index.js";

describe("image-viewer init", () => {
  it("contributes an image/* MimeRenderer with deterministic ids", async () => {
    const ws = new Workspace();
    const slots = ws.requireAdapter(Slots);
    const ctx: Record<string, unknown> = { "workspace:workspace": ws };

    const cleanup = initImageViewer(ctx);

    const snapshot = slots.getSnapshot<MimeRenderer>("files:mime-renderers");
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]?.mimeTypePattern).toBe("image/*");

    const plan = snapshot[0]?.buildPanel("/x/y.png");
    expect(plan?.catalogId).toBe(IMAGE_VIEWER_CATALOG_ID);
    expect(plan?.panelId).toBe(imageViewerPanelId("/x/y.png"));
    expect(plan?.specId).toBe(imageViewerSpecId("/x/y.png"));

    const planAgain = snapshot[0]?.buildPanel("/x/y.png");
    expect(planAgain?.panelId).toBe(plan?.panelId);
    expect(planAgain?.specId).toBe(plan?.specId);

    await cleanup();
  });

  it("removes the contribution on cleanup", async () => {
    const ws = new Workspace();
    const slots = ws.requireAdapter(Slots);
    const ctx: Record<string, unknown> = { "workspace:workspace": ws };

    const cleanup = initImageViewer(ctx);
    expect(
      slots.getSnapshot<MimeRenderer>("files:mime-renderers"),
    ).toHaveLength(1);
    await cleanup();
    expect(
      slots.getSnapshot<MimeRenderer>("files:mime-renderers"),
    ).toHaveLength(0);
  });
});
