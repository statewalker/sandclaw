import { newIntent } from "@statewalker/shared-intents";

/**
 * Re-export the canonical `workspace:change` intent from
 * `@statewalker/workspace-api`. Callers that want to switch /
 * connect / set the workspace folder fire
 * `runChangeWorkspace(intents, { files? })`.
 *
 * `runChangeWorkspace(intents, {})` opens the picker dialog
 * interactively (defers to platform-api's runPickDirectory);
 * `runChangeWorkspace(intents, { files })` rebinds non-interactively
 * (used by tests, integration harness, future CLI / MCP entry points).
 */
export {
  type ChangeWorkspacePayload,
  type ChangeWorkspaceResult,
  handleChangeWorkspace,
  runChangeWorkspace,
} from "@statewalker/workspace-api";

/**
 * Empty payload type used by both reconnect/disconnect — neither
 * intent carries data; both act on the currently-stored handle.
 */
export type WorkspaceVoidPayload = Record<string, never>;
export type WorkspaceVoidResult = Record<string, never>;

/**
 * `workspace:reconnect` — re-request permission on the currently
 * stored directory handle. On `granted` the manager internally fires
 * `runChangeWorkspace`; on `denied` it transitions to `empty`. Must
 * be fired from a user gesture so the underlying
 * `requestPermission()` call is allowed by the browser.
 */
export const WORKSPACE_RECONNECT_INTENT_KEY = "workspace:reconnect";
export const [runWorkspaceReconnect, handleWorkspaceReconnect] = newIntent<
  WorkspaceVoidPayload,
  WorkspaceVoidResult
>(WORKSPACE_RECONNECT_INTENT_KEY);

/**
 * `workspace:disconnect` — `await workspace.close()`, clear the
 * persisted handle in IndexedDB, and transition the
 * `WorkspaceShellAdapter` to `empty`. Used by the "Switch workspace"
 * header item before firing `workspace:change` so the previous
 * runtime is fully torn down before the next pick lands.
 */
export const WORKSPACE_DISCONNECT_INTENT_KEY = "workspace:disconnect";
export const [runWorkspaceDisconnect, handleWorkspaceDisconnect] = newIntent<
  WorkspaceVoidPayload,
  WorkspaceVoidResult
>(WORKSPACE_DISCONNECT_INTENT_KEY);
