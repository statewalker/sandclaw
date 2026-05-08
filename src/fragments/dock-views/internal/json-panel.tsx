import { JSONUIProvider, Renderer } from "@json-render/react";
import { Intents } from "@statewalker/shared-intents";
import type { IDockviewPanelProps } from "dockview-react";
import { type ReactElement, useSyncExternalStore } from "react";
import { useAppWorkspace } from "@/fragments/workspace-bridge-views";
import { CatalogRegistry } from "../../catalog-registry/index.js";
import { runClosePanel } from "../../dock/index.js";
import { type SpecRecord, SpecStore } from "../../spec-store/index.js";

interface JsonPanelParams {
  specId: string;
}

/**
 * The single DockView component kind. Every panel rendered by the
 * dock fragment flows through this component. It resolves the
 * spec by id from `SpecStore`, the catalog by id from
 * `CatalogRegistry`, and renders the json-render `<Renderer>`
 * against both. Missing spec / missing catalog → recovery
 * placeholder; the user can close the panel.
 *
 * The workspace is resolved via React context (`useAppWorkspace`),
 * not via `props.containerApi` — dockview-react renders panels
 * through React.createPortal, so React context propagates from
 * the parent tree (the MainShell that hosts `<DockviewReact>`).
 */
export function JsonPanel(
  props: IDockviewPanelProps<JsonPanelParams>,
): ReactElement {
  const { specId } = props.params;
  const workspace = useAppWorkspace();
  const store = workspace.requireAdapter(SpecStore);
  const catalogs = workspace.requireAdapter(CatalogRegistry);
  const intents = workspace.requireAdapter(Intents);

  const record = useSyncExternalStore<SpecRecord | null>(
    (notify) => store.observe(specId, notify),
    () => store.get(specId),
  );

  if (!record) {
    return (
      <PanelMissing
        specId={specId}
        onClose={() => runClosePanel(intents, { panelId: props.api.id })}
      />
    );
  }

  const catalogRegistry = catalogs.get(record.catalogId);
  if (!catalogRegistry) {
    return (
      <CatalogMissing
        catalogId={record.catalogId}
        onClose={() => runClosePanel(intents, { panelId: props.api.id })}
      />
    );
  }

  // The json-render `<Renderer>` types the spec/registry strictly;
  // we cross from the deliberately-loose `unknown` storage in
  // SpecStore + CatalogRegistry to its concrete types here.
  // `<JSONUIProvider>` is required — it sets up the visibility /
  // validation / state contexts that `<Renderer>`'s internals
  // (e.g. `useVisibility`) read from.
  // biome-ignore lint/suspicious/noExplicitAny: json-render's Spec/Registry types live behind `unknown` in our store
  const Renderer$ = Renderer as any;
  // biome-ignore lint/suspicious/noExplicitAny: ditto for the registry shape
  const registry$ = catalogRegistry as any;
  return (
    <JSONUIProvider registry={registry$}>
      <Renderer$ spec={record.spec} registry={registry$} />
    </JSONUIProvider>
  );
}

function PanelMissing({
  specId,
  onClose,
}: {
  specId: string;
  onClose: () => void;
}): ReactElement {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm text-muted-foreground">
        Spec <code className="font-mono text-xs">{specId}</code> is missing.
      </p>
      <button
        type="button"
        className="rounded border border-border bg-background px-3 py-1 text-sm hover:bg-accent"
        onClick={onClose}
      >
        Close panel
      </button>
    </div>
  );
}

function CatalogMissing({
  catalogId,
  onClose,
}: {
  catalogId: string;
  onClose: () => void;
}): ReactElement {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm text-muted-foreground">
        Catalog <code className="font-mono text-xs">{catalogId}</code> is not
        registered.
      </p>
      <button
        type="button"
        className="rounded border border-border bg-background px-3 py-1 text-sm hover:bg-accent"
        onClick={onClose}
      >
        Close panel
      </button>
    </div>
  );
}
