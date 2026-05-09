import { Slots } from "@statewalker/shared-slots";
import { Workspace } from "@statewalker/workspace-api";
import { describe, expect, it } from "vitest";
import type { MimeRenderer } from "@/fragments/files";
import initVideoViewer, {
  VIDEO_VIEWER_CATALOG_ID,
  videoViewerPanelId,
  videoViewerSpecId,
} from "../index.js";

describe("video-viewer init", () => {
  it("contributes a video/* MimeRenderer with deterministic ids", async () => {
    const ws = new Workspace();
    const slots = ws.requireAdapter(Slots);
    const ctx: Record<string, unknown> = { "workspace:workspace": ws };

    const cleanup = initVideoViewer(ctx);

    const snapshot = slots.getSnapshot<MimeRenderer>("files:mime-renderers");
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]?.mimeTypePattern).toBe("video/*");

    const plan = snapshot[0]?.buildPanel("/x/y.mp4");
    expect(plan?.catalogId).toBe(VIDEO_VIEWER_CATALOG_ID);
    expect(plan?.panelId).toBe(videoViewerPanelId("/x/y.mp4"));
    expect(plan?.specId).toBe(videoViewerSpecId("/x/y.mp4"));

    const planAgain = snapshot[0]?.buildPanel("/x/y.mp4");
    expect(planAgain?.panelId).toBe(plan?.panelId);
    expect(planAgain?.specId).toBe(plan?.specId);

    await cleanup();
  });

  it("removes the contribution on cleanup", async () => {
    const ws = new Workspace();
    const slots = ws.requireAdapter(Slots);
    const ctx: Record<string, unknown> = { "workspace:workspace": ws };

    const cleanup = initVideoViewer(ctx);
    expect(
      slots.getSnapshot<MimeRenderer>("files:mime-renderers"),
    ).toHaveLength(1);
    await cleanup();
    expect(
      slots.getSnapshot<MimeRenderer>("files:mime-renderers"),
    ).toHaveLength(0);
  });
});
