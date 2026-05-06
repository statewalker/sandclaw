import { newIntent } from "@statewalker/shared-intents";

export interface ShowDockPanelPayload {
  panelId: string;
  specId: string;
  position?: "left" | "right" | "top" | "bottom" | "within";
  activate?: boolean;
}

/**
 * The payload deliberately omits any DockView `component` field
 * (vision audit C7) — the dock fragment is the only place that
 * knows the panel kind is `"json"`.
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
