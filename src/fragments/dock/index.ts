export { DockHost } from "./public/dock-host.js";
export { initDock as default } from "./public/init-dock.js";
export {
  type ClosePanelPayload,
  type FocusPanelPayload,
  handleClosePanel,
  handleFocusPanel,
  handleSetPanelTitle,
  handleShowDockPanel,
  runClosePanel,
  runFocusPanel,
  runSetPanelTitle,
  runShowDockPanel,
  type SetPanelTitlePayload,
  type ShowDockPanelPayload,
} from "./public/intents.js";
export type { PanelPosition } from "./public/types.js";
