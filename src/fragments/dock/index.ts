export { DockHost } from "./dock-host.js";
export { DockViewHost } from "./dock-view-host.js";
export { initDockFragment as default } from "./init.js";
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
} from "./intents.js";
export { JsonPanel } from "./json-panel.js";
