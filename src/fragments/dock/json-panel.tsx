import { Renderer } from "@json-render/react";
import { Intents } from "@statewalker/shared-intents";
import { getWorkspace } from "@statewalker/workspace-api";
import type { IDockviewPanelProps } from "dockview-react";
import { type ReactElement, useSyncExternalStore } from "react";
import { CatalogRegistry } from "../catalog-registry/index.js";
import { type SpecRecord, SpecStore } from "../spec-store/index.js";
import { runClosePanel } from "./intents.js";

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
 */
export function JsonPanel(
  props: IDockviewPanelProps<JsonPanelParams>,
): ReactElement {
  const { specId } = props.params;

  // Resolve the workspace via the dockview panel's containerApi.
  // We stash the workspace ctx on the api when MainShell mounts;
  // see `dock-host.tsx::setApi`. The fallback uses an empty ctx
  // so getWorkspace creates one — keeps tests viable when a
  // panel is mounted standalone (e.g. against a stub api).
  const ctx =
    (
      props.containerApi as unknown as {
        __chatMiniCtx?: Record<string, unknown>;
      }
    ).__chatMiniCtx ?? {};
  const workspace = getWorkspace(ctx);
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

  const catalogEntry = catalogs.get(record.catalogId);
  if (!catalogEntry) {
    return (
      <CatalogMissing
        catalogId={record.catalogId}
        onClose={() => runClosePanel(intents, { panelId: props.api.id })}
      />
    );
  }

  // The json-render `<Renderer>` types the spec/registry strictly;
  // we cross from the deliberately-loose `unknown` storage in
  // SpecStore + CatalogEntry to its concrete types here.
  // biome-ignore lint/suspicious/noExplicitAny: json-render's Spec/Registry types live behind `unknown` in our store
  const Renderer$ = Renderer as any;
  return <Renderer$ spec={record.spec} registry={catalogEntry.registry} />;
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
