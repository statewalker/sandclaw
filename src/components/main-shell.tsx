import { Intents } from "@statewalker/shared-intents";
import { LogOut } from "lucide-react";
import { type ReactElement, useEffect } from "react";
import { SessionsPanel } from "@/components/panels/sessions-panel";
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
import { CHAT_CATALOG_ID, makeChatSpec } from "@/fragments/chat-bootstrap";
import { DockViewHost, runShowDockPanel } from "@/fragments/dock";
import { SpecStore } from "@/fragments/spec-store";

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
 * Idempotent — `runShowDockPanel` focuses an existing panel rather
 * than re-adding it. The chat spec is allocated once with a stable
 * id (`spec:chat`) and `meta.persistent: true`, so it survives
 * panel close.
 *
 * `store.create` is used directly (not `runCreateSpec`) because the
 * intent payload doesn't carry an `id` field — the deterministic
 * id `spec:chat` matters here so layout restore can find the spec.
 */
function useEnsureChatPanel(): void {
  const workspace = useAppWorkspace();
  useEffect(() => {
    const intents = workspace.requireAdapter(Intents);
    const store = workspace.requireAdapter(SpecStore);
    if (!store.get(CHAT_SPEC_ID)) {
      store.create({
        id: CHAT_SPEC_ID,
        catalogId: CHAT_CATALOG_ID,
        spec: makeChatSpec(),
        meta: { persistent: true },
      });
    }
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

export function MainShell(): ReactElement {
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
