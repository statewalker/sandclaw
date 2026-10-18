/**
 * Ids of the substrate fragments `bootShell` / `bootHeadless` install. App
 * fragments name them in `requires` / `after` instead of relying on the
 * position they are listed at.
 */
export const SUBSTRATE = {
  /** Host capabilities (`platform:*` commands): platform.browser or platform.node. */
  platform: "platform",
  /** json-render spec store and layout store (`spec:*`). */
  specStore: "render.core",
  /** Dock state (`dock:*`). */
  dock: "shell.core",
  /** How the workspace gets its file system and opens. */
  workspace: "workspace",
  settings: "settings.core",
  /** `files:*` commands over the workspace file system. */
  workspaceFiles: "workspace.files",
  /** Viewer dispatch by MIME type (`files:visualize`). */
  mime: "mime.core",
  inline: "inline.core",
  /** The React mount (`<AppRoot/>`); every renderer requires it. */
  react: "ui.view.react",
  shadcn: "ui.view.shadcn",
  workspaceReact: "workspace.view.react",
  dockReact: "shell.view.react",
  settingsReact: "settings.view.react",
  markdownViewer: "mime.view.markdown",
  imageViewer: "mime.view.image",
  pdfViewer: "mime.view.pdf",
  videoViewer: "mime.view.video",
  inlineReact: "inline.view.react",
  menubar: "app-shell.menubar",
} as const;
