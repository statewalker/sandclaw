// PROTOTYPE — Variant B: type accordion (single column).
// IA: one collapsible section per provider type; connections are rows that
// expand inline to reveal credentials + test + models. No detail pane — every-
// thing happens in place. Primary affordance: vertical scan & inline edit.
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
} from "@statewalker/ui.view.shadcn";
import {
  type Connection,
  type ConnectionsApi,
  type ConnectionType,
  PROVIDER_META,
  PROVIDER_ORDER,
  useMockConnections,
} from "./mock.js";
import {
  ConnFields,
  ErrorNote,
  Glyph,
  MiniStatus,
  Spinner,
  StatusBadge,
} from "./ui-bits.js";

export function VariantB() {
  const api = useMockConnections();
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-8">
      <div>
        <h1 className="text-xl font-semibold">Model connections</h1>
        <p className="text-sm text-muted-foreground">
          Grouped by provider. Expand a connection to configure and test it.
        </p>
      </div>
      {PROVIDER_ORDER.map((type) => (
        <TypeSection key={type} type={type} api={api} />
      ))}
    </div>
  );
}

function TypeSection({
  type,
  api,
}: {
  type: ConnectionType;
  api: ConnectionsApi;
}) {
  const meta = PROVIDER_META[type];
  const rows = api.connections.filter((c) => c.type === type);
  const connected = rows.filter((c) => c.status === "connected").length;
  return (
    <Collapsible
      defaultOpen
      className="overflow-hidden rounded-lg border border-border"
    >
      <CollapsibleTrigger className="flex w-full items-center gap-3 px-4 py-3 hover:bg-accent/40">
        <Glyph type={type} className="text-xl" />
        <span className="font-medium">{meta.label}</span>
        <span className="text-xs text-muted-foreground">
          {connected ? `${connected} connected` : "none connected"}
        </span>
        <span className="ml-auto text-muted-foreground">⌄</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-border">
        {rows.map((c) => (
          <ConnRow key={c.id} c={c} api={api} />
        ))}
        <button
          type="button"
          onClick={() => api.addCustom(type)}
          className="w-full px-4 py-2 text-left text-xs text-muted-foreground hover:bg-accent/50"
        >
          + Add {meta.label} connection
        </button>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ConnRow({ c, api }: { c: Connection; api: ConnectionsApi }) {
  const busy = c.status === "testing";
  return (
    <Collapsible className="border-b border-border last:border-b-0">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <CollapsibleTrigger className="flex flex-1 items-center gap-3 text-left">
          <MiniStatus c={c} />
          <span className="text-sm">{c.name}</span>
        </CollapsibleTrigger>
        <StatusBadge c={c} />
        <Button
          size="sm"
          variant="outline"
          onClick={() => api.test(c.id)}
          disabled={busy}
        >
          {busy ? <Spinner /> : "Test"}
        </Button>
      </div>
      <CollapsibleContent className="space-y-4 bg-muted/30 px-4 py-4">
        <ConnFields c={c} onChange={(p) => api.update(c.id, p)} />
        {c.status === "error" && <ErrorNote message={c.error} />}
        {c.discoveredModels && (
          <div>
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">
              Star models for chat ({c.starredModelIds.length})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {c.discoveredModels.map((m) => {
                const on = c.starredModelIds.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => api.toggleStar(c.id, m.id)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
                      on
                        ? "border-amber-400/50 bg-amber-400/10 text-foreground"
                        : "border-border text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {on ? "★" : "☆"} {m.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {c.status === "connected" && (
          <button
            type="button"
            onClick={() => api.disconnect(c.id)}
            className="text-xs text-destructive hover:underline"
          >
            Disconnect
          </button>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
