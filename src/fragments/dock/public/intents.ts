import { newIntent } from "@statewalker/shared-intents";
import type { PanelPosition } from "./types.js";

export interface ShowDockPanelPayload {
  panelId: string;
  specId: string;
  position?: PanelPosition;
  activate?: boolean;
}

/**
 * The payload deliberately omits any DockView `component` field
 * (vision audit C7 / proposal §5.5) — the dock fragment is the only
 * place that knows the panel kind is `"json"`.
 */
export const [runShowDockPanel, handleShowDockPanel] = newIntent<
  ShowDockPanelPayload,
  void
>("dock:show-panel");

export interface ClosePanelPayload {
  panelId: string;
}
export const [runClosePanel, handleClosePanel] = newIntent<
  ClosePanelPayload,
  void
>("dock:close-panel");

export interface FocusPanelPayload {
  panelId: string;
}
export const [runFocusPanel, handleFocusPanel] = newIntent<
  FocusPanelPayload,
  void
>("dock:focus-panel");

export interface SetPanelTitlePayload {
  panelId: string;
  title: string;
}
/**
 * Sets the tab title shown in DockView's tab bar. No-op when the
 * panel is not open. Generic across panel kinds — chat tabs, future
 * file tabs, etc. — so the dock fragment owns the mechanism rather
 * than each catalog reinventing it.
 */
export const [runSetPanelTitle, handleSetPanelTitle] = newIntent<
  SetPanelTitlePayload,
  void
>("dock:set-panel-title");
