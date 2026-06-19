// PROTOTYPE — throwaway. Shared atoms reused across all variants. Layout/IA is
// intentionally NOT shared — that is the thing each variant disagrees about.

import { cn, Input } from "@statewalker/ui.view.shadcn";
import type { ReactNode } from "react";
import {
  type Capability,
  type Connection,
  type ConnectionType,
  PROVIDER_META,
} from "./mock.js";

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
    />
  );
}

export function Glyph({
  type,
  className,
}: {
  type: ConnectionType;
  className?: string;
}) {
  const m = PROVIDER_META[type];
  return (
    <span className={cn("leading-none", m.accent, className)}>{m.glyph}</span>
  );
}

const CAP_LABEL: Record<Capability, string> = {
  chat: "chat",
  embedding: "embed",
  "image-gen": "image",
  tts: "speech",
};

export function CapTag({ cap }: { cap: Capability }) {
  return (
    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      {CAP_LABEL[cap]}
    </span>
  );
}

function Dot({ className }: { className?: string }) {
  return <span className={cn("size-2 rounded-full", className)} />;
}

export function MiniStatus({ c }: { c: Connection }) {
  if (c.status === "testing")
    return <Spinner className="size-3 text-muted-foreground" />;
  const color =
    c.status === "connected"
      ? "bg-emerald-500"
      : c.status === "error"
        ? "bg-destructive"
        : "bg-muted-foreground/30";
  return <Dot className={color} />;
}

export function StatusBadge({ c }: { c: Connection }) {
  if (c.status === "testing")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Spinner /> Testing…
      </span>
    );
  if (c.status === "connected")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <Dot className="bg-emerald-500" /> Connected ·{" "}
        {c.discoveredModels?.length ?? 0} models
      </span>
    );
  if (c.status === "error")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive">
        <Dot className="bg-destructive" /> Connection failed
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <Dot className="bg-muted-foreground/40" /> Not connected
    </span>
  );
}

export function Star({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={on ? "Unstar model" : "Star model"}
      className={cn(
        "text-base leading-none transition-colors",
        on
          ? "text-amber-400"
          : "text-muted-foreground/40 hover:text-muted-foreground",
      )}
    >
      {on ? "★" : "☆"}
    </button>
  );
}

export function ErrorNote({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
      {message}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

// The credential form is the same regardless of layout — shared so the variants
// differ in *arrangement*, not in field markup.
export function ConnFields({
  c,
  onChange,
}: {
  c: Connection;
  onChange: (patch: Partial<Connection>) => void;
}) {
  const m = PROVIDER_META[c.type];
  return (
    <div className="grid gap-3">
      <Field label="Display name">
        <Input
          value={c.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder={m.label}
        />
      </Field>
      <Field label="API key">
        <Input
          type="password"
          value={c.apiKey}
          onChange={(e) => onChange({ apiKey: e.target.value })}
          placeholder={m.keyPlaceholder}
        />
      </Field>
      <Field label={m.urlRequired ? "Endpoint URL" : "Endpoint URL (optional)"}>
        <Input
          value={c.url ?? ""}
          onChange={(e) => onChange({ url: e.target.value })}
          placeholder={m.urlPlaceholder}
        />
      </Field>
    </div>
  );
}
