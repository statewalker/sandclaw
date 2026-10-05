export { default as initPlatformNode } from "@statewalker/platform.node";
export {
  type BootHeadlessOptions,
  type BootLogicOptions,
  type BootShellOptions,
  type BootShellResult,
  bootHeadless,
  bootLogic,
  bootShell,
  type FragmentInit,
} from "./boot-shell.js";
export * from "./extension-points.js";
