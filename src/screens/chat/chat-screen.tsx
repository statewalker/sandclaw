import { Intents } from "@statewalker/shared-intents";
import { LogOut } from "lucide-react";
import { type ReactElement, useEffect, useRef } from "react";
import { useSearchParams } from "react-router";
import { ProviderSettingsDialog } from "@/components/providers/provider-settings-dialog";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { RuntimeProvider } from "@/contexts/runtime-context";
import { useWorkspace } from "@/contexts/workspace-context";
import { runOpenChatSession } from "@/fragments/chat";
import { DockHost } from "@/fragments/dock";
import { DockViewHost } from "@/fragments/dock-views";
import { useAppWorkspace } from "@/fragments/workspace-bridge-views";
import { SessionsPanel } from "@/screens/chat/components/sessions-panel";

const SESSION_PARAM = "s";

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
 * Deep-link handler: on FIRST mount, if the URL has `?s=<id>` AND
 * the dock host has no chat tabs (saved layout took priority if it
 * had any), fire `chat:open-session` for that id once. After first
 * mount the URL is no longer consulted; tab focus changes do not
 * write the URL back.
 */
function useDeepLinkSession(): void {
  const workspace = useAppWorkspace();
  const [searchParams] = useSearchParams();
  const ranRef = useRef(false);
  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    const id = searchParams.get(SESSION_PARAM);
    if (!id) return;
    const dockHost = workspace.requireAdapter(DockHost);
    const hasChatTab = dockHost
      ._getApi()
      ?.panels?.some((p) => p.id.startsWith("chat:"));
    if (hasChatTab) return;
    const intents = workspace.requireAdapter(Intents);
    runOpenChatSession(intents, { sessionId: id });
  }, [workspace, searchParams]);
}

function MainPane(): ReactElement {
  const workspace = useAppWorkspace();
  useDeepLinkSession();
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
    </RuntimeProvider>
  );
}
