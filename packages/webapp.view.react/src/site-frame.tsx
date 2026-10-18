import type { SiteFrameParams } from "@statewalker/webapp.browser";
import type { ReactElement } from "react";

/**
 * Pure renderer for the web-app dock tab: an `<iframe>` pointed at the hosted client entry
 * (`baseUrl + clientEntry`). It reads both params from the dock spec (produced by
 * `makeSiteFrameSpec` in `webapp.browser`) and does nothing else — the URL is already
 * resolved by the open command, so this component never touches the host binding
 * (ADR-0002: the renderer imports no logic).
 */
export function SiteFrame({ baseUrl, clientEntry }: SiteFrameParams): ReactElement {
  return (
    <iframe
      src={`${baseUrl}${clientEntry}`}
      title="web-app"
      style={{ width: "100%", height: "100%", border: "none" }}
    />
  );
}
