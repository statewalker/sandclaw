// Node / test entry: everything here runs without a DOM or React.
export { default as initPlatformNode } from "@statewalker/platform.node";
export {
  type AppFragmentOptions,
  type BootShellResult,
  createWorkspaceContext,
  type FragmentInit,
} from "./boot-common.js";
export { type BootHeadlessOptions, bootHeadless } from "./boot-headless.js";
export { SUBSTRATE } from "./substrate-ids.js";
export { substrateLogic } from "./substrate-logic.js";
