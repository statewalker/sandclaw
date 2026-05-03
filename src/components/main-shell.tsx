import { LogOut } from "lucide-react";
import { ChatPanel } from "@/components/panels/chat-panel";
import { SessionsPanel } from "@/components/panels/sessions-panel";
import { ProviderConfigGate } from "@/components/providers/provider-config-gate";
import { ProviderSettingsDialog } from "@/components/providers/provider-settings-dialog";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ActiveSessionProvider } from "@/contexts/active-session-context";
import { RuntimeProvider, useRuntime } from "@/contexts/runtime-context";
import { useWorkspace } from "@/contexts/workspace-context";

function ShellHeader(): React.ReactElement {
  const { state, switchWorkspace } = useWorkspace();
  const label = state.status === "ready" ? state.label : "";
  return (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b bg-background px-3">
      <span className="text-sm font-semibold">Chat Mini</span>
      <span className="text-xs text-muted-foreground">/</span>
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="ml-auto" />
      <ProviderSettingsDialog />
      <Button size="sm" variant="ghost" onClick={() => void switchWorkspace()}>
        <LogOut className="h-3.5 w-3.5" /> Switch workspace
      </Button>
    </header>
  );
}

function MainArea(): React.ReactElement {
  const { state } = useRuntime();
  const showGate =
    state.status === "no-providers" || state.status === "no-active-model";
  return showGate ? <ProviderConfigGate /> : <ChatPanel />;
}

export function MainShell(): React.ReactElement {
  const { state } = useWorkspace();
  if (state.status !== "ready") {
    // The router gates us into here only when ready; this is a defensive
    // fallback for state transitions.
    return <div />;
  }
  return (
    <RuntimeProvider files={state.filesApi}>
      <ActiveSessionProvider>
        <div className="flex h-full w-full flex-col">
          <ShellHeader />
          <ResizablePanelGroup orientation="horizontal" className="flex-1">
            <ResizablePanel defaultSize="280px" minSize="180px" maxSize="40%">
              <SessionsPanel />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel minSize="40%">
              <MainArea />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </ActiveSessionProvider>
    </RuntimeProvider>
  );
}
