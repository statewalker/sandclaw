import type { Session } from "@statewalker/ai-agent/runtime";

/**
 * Override the model used by a session's underlying controller.
 *
 * Workaround: `AgentRuntime.loadSession` constructs a synthetic agent
 * with `name: "__resumed__"` and no `defaultModel`, so the controller's
 * `model` field starts as `""`. Until ai-agent exposes a public way to
 * rebind a resumed session to a real agent definition, we reach into
 * the (otherwise private) `_controller` and set its public `model`
 * field directly. The controller's model is meant to be settable.
 */
export function setSessionModel(session: Session, model: string): void {
  const internal = session as unknown as { _controller: { model: string } };
  if (internal._controller && typeof internal._controller.model === "string") {
    internal._controller.model = model;
  }
}
