import { Command, passthrough } from "@statewalker/shared-commands";

export interface OpenWikiSitePayload {
  /** Wiki project name. */
  project: string;
  /** Site slug (the `sites/<slug>/` folder). */
  slug: string;
}

/** Open a generated thematic site (by project + slug) as a dock panel. */
export const OpenWikiSiteCommand = Command.silent("wiki:open-site")
  .input(passthrough<OpenWikiSitePayload>())
  .output(passthrough<void>())
  .build();
