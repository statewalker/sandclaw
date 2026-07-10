// PROTOTYPE — Variant C: card grid + modal dialog.
// IA: a dashboard of connection cards (status at a glance); configuring opens a
// focused dialog. Adding picks a provider type from a dialog. Primary
// affordance: overview first, drill into a modal to edit. Scales visually.

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@statewalker/ui.view.shadcn";
import { useState } from "react";
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
  Spinner,
  Star,
  StatusBadge,
} from "./ui-bits.js";

export function VariantC() {
  const api = useMockConnections();
  const [editId, setEditId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const editing = api.connections.find((c) => c.id === editId) ?? null;
  const connected = api.connections.filter(
    (c) => c.status === "connected",
  ).length;

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Model connections</h1>
        <p className="text-sm text-muted-foreground">
          {connected} of {api.connections.length} connected
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {api.connections.map((c) => (
          <ConnCard
            key={c.id}
            c={c}
            api={api}
            onConfigure={() => setEditId(c.id)}
          />
        ))}
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex min-h-[168px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
        >
          <span className="text-2xl">＋</span>
          <span className="text-sm">Add connection</span>
        </button>
      </div>

      <ConfigDialog conn={editing} api={api} onClose={() => setEditId(null)} />
      <AddDialog
        open={adding}
        onClose={() => setAdding(false)}
        onPick={(t) => {
          setAdding(false);
          setEditId(api.addCustom(t));
        }}
      />
    </div>
  );
}

function ConnCard({
  c,
  api,
  onConfigure,
}: {
  c: Connection;
  api: ConnectionsApi;
  onConfigure: () => void;
}) {
  const busy = c.status === "testing";
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-center gap-3 space-y-0">
        <Glyph type={c.type} className="text-2xl" />
        <div className="min-w-0 flex-1">
          <CardTitle className="truncate text-base">{c.name}</CardTitle>
          <CardDescription>{PROVIDER_META[c.type].label}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        <StatusBadge c={c} />
        {c.status === "error" && <ErrorNote message={c.error} />}
        {c.status === "connected" && (
          <div className="text-xs text-muted-foreground">
            ★ {c.starredModelIds.length} starred · {c.discoveredModels?.length}{" "}
            available
          </div>
        )}
      </CardContent>
      <CardFooter className="gap-2">
        <Button
          size="sm"
          className="flex-1"
          onClick={() => api.test(c.id)}
          disabled={busy}
        >
          {busy ? (
            <>
              <Spinner className="mr-1.5" />
              Testing
            </>
          ) : (
            "Test"
          )}
        </Button>
        <Button size="sm" variant="outline" onClick={onConfigure}>
          Configure
        </Button>
      </CardFooter>
    </Card>
  );
}

function ConfigDialog({
  conn,
  api,
  onClose,
}: {
  conn: Connection | null;
  api: ConnectionsApi;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!conn} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        {conn && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Glyph type={conn.type} className="text-xl" /> {conn.name}
              </DialogTitle>
              <DialogDescription>
                Configure credentials and choose models for chat.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <ConnFields c={conn} onChange={(p) => api.update(conn.id, p)} />
              {conn.status === "error" && <ErrorNote message={conn.error} />}
              {conn.discoveredModels && (
                <div>
                  <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                    Models ({conn.discoveredModels.length})
                  </div>
                  <div className="max-h-48 space-y-0.5 overflow-y-auto rounded-md border border-border p-1">
                    {conn.discoveredModels.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center gap-2 rounded px-2 py-1 hover:bg-accent/50"
                      >
                        <Star
                          on={conn.starredModelIds.includes(m.id)}
                          onClick={() => api.toggleStar(conn.id, m.id)}
                        />
                        <span className="flex-1 text-sm">{m.label}</span>
                        {m.capabilities?.map((cap) => (
                          <CapTag key={cap} cap={cap} />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter className="gap-2">
              {conn.status === "connected" && (
                <Button variant="ghost" onClick={() => api.disconnect(conn.id)}>
                  Disconnect
                </Button>
              )}
              <Button
                onClick={() => api.test(conn.id)}
                disabled={conn.status === "testing"}
              >
                {conn.status === "testing" ? (
                  <>
                    <Spinner className="mr-1.5" />
                    Testing…
                  </>
                ) : (
                  "Test & connect"
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddDialog({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (t: ConnectionType) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add a connection</DialogTitle>
          <DialogDescription>Choose a provider type.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {PROVIDER_ORDER.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onPick(t)}
              className="flex flex-col items-center gap-2 rounded-lg border border-border p-4 hover:bg-accent"
            >
              <Glyph type={t} className="text-2xl" />
              <span className="text-sm font-medium">
                {PROVIDER_META[t].label}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
