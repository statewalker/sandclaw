// PROTOTYPE — Variant A (revised): provider connections as tabs.
// IA: one tab per connection; the right of the tab bar holds a "New connection"
// type-picker that spawns a new tab. Each tab's sub-panel is a collapsible
// credential form (open until connected, auto-folded after) followed by the
// list of discovered models. Fits the existing Settings dialog (Tabs already
// exist in the JsonRender catalog) better than a left-rail master/detail.

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@statewalker/ui.view.shadcn";
import { useEffect, useRef, useState } from "react";
import {
  type Connection,
  type ConnectionsApi,
  type ConnectionType,
  PROVIDER_META,
  PROVIDER_ORDER,
  useMockConnections,
} from "./mock.js";
import {
  CapTag,
  ConnFields,
  ErrorNote,
  Glyph,
  MiniStatus,
  Spinner,
  Star,
  StatusBadge,
} from "./ui-bits.js";

export function VariantA() {
  const api = useMockConnections();
  const [selId, setSelId] = useState<string | undefined>(
    api.connections[0]?.id,
  );
  const current =
    api.connections.find((c) => c.id === selId) ?? api.connections[0];

  const addConnection = (type: ConnectionType) => setSelId(api.addCustom(type));

  const removeConnection = (id: string) => {
    const idx = api.connections.findIndex((c) => c.id === id);
    const neighbour = api.connections[idx + 1] ?? api.connections[idx - 1];
    api.remove(id);
    setSelId(neighbour?.id);
  };

  return (
    <div className="mx-auto flex h-screen max-w-4xl flex-col">
      <header className="px-6 py-4">
        <h1 className="text-lg font-semibold">Model connections</h1>
        <p className="text-sm text-muted-foreground">
          Connect, test, and pick models from your AI providers
        </p>
      </header>

      <Tabs
        value={current?.id}
        onValueChange={setSelId}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="flex items-center gap-2 border-y border-border px-3 py-1">
          <div className="flex-1 overflow-x-auto">
            <TabsList className="h-auto justify-start gap-1 bg-transparent p-0">
              {api.connections.map((c) => (
                <TabsTrigger
                  key={c.id}
                  value={c.id}
                  className="gap-2 data-[state=active]:bg-accent"
                >
                  <MiniStatus c={c} />
                  {c.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <NewConnectionPicker onAdd={addConnection} />
        </div>

        {api.connections.map((c) => (
          <TabsContent
            key={c.id}
            value={c.id}
            className="min-h-0 flex-1 overflow-hidden"
          >
            <SubPanel c={c} api={api} onRemove={removeConnection} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function NewConnectionPicker({
  onAdd,
}: {
  onAdd: (t: ConnectionType) => void;
}) {
  // Controlled with value="" so the trigger always shows the placeholder and
  // acts as an action menu rather than a value selector.
  return (
    <Select value="" onValueChange={(t) => onAdd(t as ConnectionType)}>
      <SelectTrigger className="w-[170px] shrink-0">
        <SelectValue placeholder="+ New connection" />
      </SelectTrigger>
      <SelectContent>
        {PROVIDER_ORDER.map((t) => (
          <SelectItem key={t} value={t}>
            {PROVIDER_META[t].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SubPanel({
  c,
  api,
  onRemove,
}: {
  c: Connection;
  api: ConnectionsApi;
  onRemove: (id: string) => void;
}) {
  const busy = c.status === "testing";
  const connected = c.status === "connected";

  // Form is open while not connected; folds itself the moment a connect lands.
  const [settingsOpen, setSettingsOpen] = useState(!connected);
  const prev = useRef(c.status);
  useEffect(() => {
    if (prev.current !== "connected" && c.status === "connected") {
      setSettingsOpen(false);
    }
    prev.current = c.status;
  }, [c.status]);

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-2xl space-y-5 p-6">
        <div className="flex items-start gap-3">
          <Glyph type={c.type} className="mt-0.5 text-2xl" />
          <div className="flex-1">
            <h2 className="text-base font-semibold">{c.name}</h2>
            <StatusBadge c={c} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => api.test(c.id)} disabled={busy}>
              {busy ? (
                <>
                  <Spinner className="mr-1.5" />
                  Testing…
                </>
              ) : connected ? (
                "Re-test"
              ) : (
                "Test & connect"
              )}
            </Button>
            {connected && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => api.disconnect(c.id)}
              >
                Disconnect
              </Button>
            )}
            <RemoveButton c={c} onRemove={onRemove} />
          </div>
        </div>

        {c.status === "error" && <ErrorNote message={c.error} />}

        <Collapsible
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          className="rounded-lg border border-border"
        >
          <CollapsibleTrigger className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium hover:bg-accent/40">
            <span
              className={cn(
                "text-muted-foreground transition-transform",
                settingsOpen && "rotate-90",
              )}
            >
              ▸
            </span>
            Connection settings
            {!settingsOpen && connected && (
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                API key set · click to edit
              </span>
            )}
          </CollapsibleTrigger>
          <CollapsibleContent className="border-t border-border p-4">
            <ConnFields c={c} onChange={(p) => api.update(c.id, p)} />
          </CollapsibleContent>
        </Collapsible>

        {c.discoveredModels && (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">
                Available models{" "}
                <span className="text-muted-foreground">
                  ({c.discoveredModels.length})
                </span>
              </h3>
              <span className="text-xs text-muted-foreground">
                ★ {c.starredModelIds.length} starred for chat
              </span>
            </div>
            <div className="divide-y divide-border rounded-md border border-border">
              {c.discoveredModels.map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-3 py-2">
                  <Star
                    on={c.starredModelIds.includes(m.id)}
                    onClick={() => api.toggleStar(c.id, m.id)}
                  />
                  <span className="flex-1 text-sm">{m.label}</span>
                  <div className="flex gap-1">
                    {m.capabilities?.map((cap) => (
                      <CapTag key={cap} cap={cap} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </ScrollArea>
  );
}

function RemoveButton({
  c,
  onRemove,
}: {
  c: Connection;
  onRemove: (id: string) => void;
}) {
  const trigger = (
    <Button
      size="sm"
      variant="ghost"
      className="text-destructive hover:text-destructive"
    >
      Remove
    </Button>
  );

  // No saved key — nothing to lose, so drop the tab immediately.
  if (c.apiKey.trim().length === 0) {
    return (
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive hover:text-destructive"
        onClick={() => onRemove(c.id)}
      >
        Remove
      </Button>
    );
  }

  // Credentials exist — confirm before deleting them.
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove “{c.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            This deletes the connection and its saved API key. You’ll need to
            re-enter credentials to use {PROVIDER_META[c.type].label} again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => onRemove(c.id)}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Remove connection
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
