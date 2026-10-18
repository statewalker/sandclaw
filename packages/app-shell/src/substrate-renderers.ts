import initInlineContentReact from "@statewalker/inline.view.react/fragment";
import { type Fragment, type FragmentInit, fromInit } from "@statewalker/kernel.core";
import initImageViewerReact from "@statewalker/mime.view.image/fragment";
import initMarkdownViewerReact from "@statewalker/mime.view.markdown/fragment";
import initPdfViewerReact from "@statewalker/mime.view.pdf/fragment";
import initVideoViewerReact from "@statewalker/mime.view.video/fragment";
import initSettingsReact from "@statewalker/settings.view.react/fragment";
import initDockReact from "@statewalker/shell.view.react/fragment";
import initCoreReact from "@statewalker/ui.view.react/fragment";
import initShadcnReact from "@statewalker/ui.view.shadcn/fragment";
import initWorkspaceBridgeReact from "@statewalker/workspace.view.react/fragment";
import { initMenubar } from "./menubar-init.js";
import { SUBSTRATE as S } from "./substrate-ids.js";

/** The React renderers of the substrate; `ui.view.react` owns the mount and comes first. */
export function substrateRenderers(): Fragment[] {
  const view = (id: string, init: FragmentInit, label: string, requires: string[] = []) =>
    fromInit(id, init, { label, requires: [S.react, ...requires] });
  return [
    fromInit(S.react, initCoreReact, { label: "React mount", requires: [S.workspace] }),
    fromInit(S.shadcn, initShadcnReact, { label: "shadcn/ui" }),
    view(S.workspaceReact, initWorkspaceBridgeReact, "Workspace views", [S.dock]),
    view(S.dockReact, initDockReact, "Dock views", [S.dock]),
    view(S.settingsReact, initSettingsReact, "Settings views", [S.settings, S.dock]),
    view(S.markdownViewer, initMarkdownViewerReact, "Markdown viewer", [S.mime]),
    view(S.imageViewer, initImageViewerReact, "Image viewer", [S.mime]),
    view(S.pdfViewer, initPdfViewerReact, "PDF viewer", [S.mime]),
    view(S.videoViewer, initVideoViewerReact, "Video viewer", [S.mime]),
    view(S.inlineReact, initInlineContentReact, "Inline content views", [S.inline]),
    // After the substrate views so view-key resolution sees the populated registry.
    view(S.menubar, initMenubar, "Menubar", [S.dock, S.settings]),
  ];
}
