import { Command, passthrough } from "@statewalker/shared-commands";

export interface OpenWikiSitePayload {
  /** Wiki project name. */
  project: string;
  /** Site slug (the `sites/<slug>/` folder). */
  slug: string;
}

/**
 * Open a generated thematic site (by project + slug) as a panel. The command
 * *contract* lives here (React-free) so logic — e.g. the `generate_site` tool —
 * can dispatch it; the *handler* (panel opening) is provided by the renderer
 * `@statewalker/wiki.view.react`. When no renderer is registered (headless / CLI)
 * the command is simply unhandled.
 */
export const OpenWikiSiteCommand = Command.silent("wiki:open-site")
  .input(passthrough<OpenWikiSitePayload>())
  .output(passthrough<void>())
  .build();
