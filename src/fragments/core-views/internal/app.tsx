import type { ReactElement } from "react";
import { MainShell } from "@/fragments/dock-views";
import { WorkspaceShellAdapter } from "@/fragments/workspace-bridge";
import { DirectoryPickerEmptyState } from "@/fragments/workspace-bridge-views";
import { useAdapterValue } from "./use-adapter-value.js";

/**
 * Root surface switch (per ADR 0003). Reads `WorkspaceShellAdapter`
 * via `useAdapterValue` and renders one of two top-level surfaces:
 *
 *   - `<DirectoryPickerEmptyState/>` whenever the workspace shell is
 *     `loading | unsupported | empty | needs-permission`. The single
 *     component covers all four; the picker UI knows how to render
 *     each branch.
 *   - `<MainShell/>` once the shell reaches `ready`.
 */
export function App(): ReactElement {
  const state = useAdapterValue(WorkspaceShellAdapter, (a) => a.getState());
  if (state.status !== "ready") {
    return <DirectoryPickerEmptyState />;
  }
  return <MainShell />;
}
