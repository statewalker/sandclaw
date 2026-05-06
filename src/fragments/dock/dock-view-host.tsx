import type { Workspace } from "@statewalker/workspace-api";
import {
  type DockviewApi,
  DockviewReact,
  type DockviewReadyEvent,
} from "dockview-react";
import "dockview-react/dist/styles/dockview.css";
import { type ReactElement, useCallback, useEffect } from "react";
import { DockHost } from "./dock-host.js";
import { JsonPanel } from "./json-panel.js";

const components = { json: JsonPanel } as const;

interface DockViewHostProps {
  workspace: Workspace;
}

/**
 * The DockView host component. Mount this once in the React tree
 * (inside `MainShell`). On `onReady`, captures the `DockviewApi`
 * and binds it to the workspace's `DockHost` adapter; the
 * workspace ctx is also stashed on the api so `JsonPanel` can
 * resolve adapters per-mount via `getWorkspace(ctx)`.
 *
 * One DockView component kind is registered: `"json"` →
 * `<JsonPanel>`. Any future panel kind would defeat the
 * spec-as-extension-mechanism architecture (vision §3.3 / D1).
 *
 * `workspace` arrives as a prop because the `useWorkspace()` hook
 * lands later (§6 React-context bridge); using a prop here keeps
 * the host renderable from anywhere a Workspace instance is in
 * scope (e.g. test harnesses).
 */
export function DockViewHost({ workspace }: DockViewHostProps): ReactElement {
  const dockHost = workspace.requireAdapter(DockHost);

  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      attachWorkspaceCtx(event.api, workspace);
      dockHost.setApi(event.api);
    },
    [dockHost, workspace],
  );

  useEffect(() => {
    return () => dockHost.detach();
  }, [dockHost]);

  return (
    <DockviewReact
      components={components}
      onReady={onReady}
      className="dockview-theme-light h-full w-full"
    />
  );
}

function attachWorkspaceCtx(api: DockviewApi, workspace: Workspace): void {
  (
    api as unknown as { __chatMiniCtx?: Record<string, unknown> }
  ).__chatMiniCtx = {
    "workspace:workspace": workspace,
  };
}
