import initInlineContent from "@statewalker/inline.core/fragment";
import { type Fragment, type FragmentInit, fromInit } from "@statewalker/kernel.core";
import initFiles from "@statewalker/mime.core/fragment";
import initSpecStore from "@statewalker/render.core/fragment";
import initSettings from "@statewalker/settings.core/fragment";
import initDock from "@statewalker/shell.core/fragment";
import initWorkspaceFiles from "@statewalker/workspace.core/files-fragment";
import { SUBSTRATE as S } from "./substrate-ids.js";

/**
 * The isomorphic logic substrate, in its historical order: platform →
 * spec-store → dock → workspace → settings → workspace-files → files →
 * inline-content. The host supplies the two host-specific fragments.
 */
export function substrateLogic(host: {
  platform: FragmentInit;
  provisionWorkspace: FragmentInit;
}): Fragment[] {
  return [
    fromInit(S.platform, host.platform, { label: "Platform" }),
    fromInit(S.specStore, initSpecStore, { label: "Spec store" }),
    fromInit(S.dock, initDock, { label: "Dock", requires: [S.specStore] }),
    fromInit(S.workspace, host.provisionWorkspace, { label: "Workspace", requires: [S.platform] }),
    fromInit(S.settings, initSettings, { label: "Settings" }),
    fromInit(S.workspaceFiles, initWorkspaceFiles, { label: "Workspace files" }),
    fromInit(S.mime, initFiles, { label: "File viewers", requires: [S.dock, S.specStore] }),
    fromInit(S.inline, initInlineContent, { label: "Inline content" }),
  ];
}
