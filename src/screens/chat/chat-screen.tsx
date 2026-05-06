import { Intents } from "@statewalker/shared-intents";
import { LogOut } from "lucide-react";
import { type ReactElement, useEffect } from "react";
import { ProviderSettingsDialog } from "@/components/providers/provider-settings-dialog";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ActiveSessionProvider } from "@/contexts/active-session-context";
import { useAppWorkspace } from "@/contexts/app-workspace-context";
import { RuntimeProvider } from "@/contexts/runtime-context";
import { useWorkspace } from "@/contexts/workspace-context";
import { DockViewHost, runShowDockPanel } from "@/fragments/dock";
import { SessionsPanel } from "@/screens/chat/components/sessions-panel";

const CHAT_PANEL_ID = "chat";
const CHAT_SPEC_ID = "spec:chat";

function ShellHeader(): ReactElement {
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

/**
 * Ensures the single chat panel is open inside the DockView host.
 * The chat spec itself is allocated by `initChatBootstrap` at boot
 * time (with `meta.persistent: true` and the deterministic id
 * `spec:chat`), so this hook only needs to dispatch the show
 * intent. `runShowDockPanel` is idempotent — focuses an existing
 * panel rather than re-adding it.
 */
function useEnsureChatPanel(): void {
  const workspace = useAppWorkspace();
  useEffect(() => {
    const intents = workspace.requireAdapter(Intents);
    runShowDockPanel(intents, {
      panelId: CHAT_PANEL_ID,
      specId: CHAT_SPEC_ID,
    });
  }, [workspace]);
}

function MainPane(): ReactElement {
  const workspace = useAppWorkspace();
  useEnsureChatPanel();
  return <DockViewHost workspace={workspace} />;
}

export function ChatScreen(): ReactElement {
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
              <MainPane />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </ActiveSessionProvider>
    </RuntimeProvider>
  );
}
