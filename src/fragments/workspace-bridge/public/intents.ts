/**
 * Re-export the canonical workspace-change intent from
 * `@statewalker/workspace-api`. The chat-mini-side `workspace-bridge`
 * fragment registers the standard handler from that package; callers
 * that want to switch / disconnect / set the workspace folder fire
 * `runChangeWorkspace(intents, { files? })`.
 *
 * Per the proposal §6.7 ("Workspace switch is just another lifecycle
 * cycle"), workspace-bridge is not introducing new intents for
 * connect/disconnect — `runChangeWorkspace` covers both:
 *   - `runChangeWorkspace(intents, {})` opens the picker dialog
 *     interactively (defers to platform-api's runPickDirectory)
 *   - `runChangeWorkspace(intents, { files })` rebinds non-
 *     interactively (used by tests, integration harness, future
 *     CLI / MCP entry points)
 *
 * Disconnect is just a `workspace.close()` triggered on user action;
 * no separate intent surface needed today.
 */
export {
  type ChangeWorkspacePayload,
  type ChangeWorkspaceResult,
  handleChangeWorkspace,
  runChangeWorkspace,
} from "@statewalker/workspace-api";
