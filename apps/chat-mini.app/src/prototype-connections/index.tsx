// PROTOTYPE — throwaway. Mount point for the model-connections redesign.
// Activated by `?prototype=connections` in the URL (see main.tsx gate); the
// active layout is chosen with `?variant=A|B|C|D`.
//
// Run:  pnpm --filter @statewalker/chat-mini-app dev
// Open: http://localhost:3460/?prototype=connections&variant=A
//
// Delete this whole folder (and the main.tsx gate) once a variant is chosen.
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { PrototypeSwitcher, type VariantDef } from "./prototype-switcher.js";
import { VariantA } from "./variant-a-provider-tabs.js";
import { VariantB } from "./variant-b-type-accordion.js";
import { VariantC } from "./variant-c-card-grid.js";
import { VariantD } from "./variant-d-wizard.js";

const VARIANTS: (VariantDef & { Component: () => ReactNode })[] = [
  { key: "A", name: "Provider tabs", Component: VariantA },
  { key: "B", name: "Type accordion", Component: VariantB },
  { key: "C", name: "Card grid + dialog", Component: VariantC },
  { key: "D", name: "Guided wizard", Component: VariantD },
];

function ConnectionsPrototype() {
  const [variant, setVariant] = useState(
    () =>
      new URL(window.location.href).searchParams
        .get("variant")
        ?.toUpperCase() ?? "A",
  );

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("variant", variant);
    window.history.replaceState({}, "", url);
  }, [variant]);

  const active = VARIANTS.find((v) => v.key === variant) ?? VARIANTS[0];
  if (!active) return null;
  const Active = active.Component;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Active />
      <PrototypeSwitcher
        variants={VARIANTS}
        current={active.key}
        onChange={setVariant}
      />
    </div>
  );
}

/** Returns true and mounts the prototype when `?prototype=connections` is set. */
export function maybeMountConnectionsPrototype(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (params.get("prototype") !== "connections") return false;
  const el = document.getElementById("app");
  if (!el) return false;
  createRoot(el).render(<ConnectionsPrototype />);
  return true;
}
