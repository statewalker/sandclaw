// @statewalker/webapp.view.react — public barrel.
//
// The React renderer half of the web-app dock bridge (ADR-0002): the pure `<SiteFrame>`
// iframe component and its catalog. The paired open-command logic + dock-panel identity
// live in `@statewalker/webapp.browser`; the fragment default export (`./fragment`) wires
// the catalog into the shell's `json:catalogs` slot.

export * from "./catalog.js";
export * from "./site-frame.js";
