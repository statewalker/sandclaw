// PROTOTYPE — Variant D: guided wizard (stepper).
// IA: a linear flow — pick provider → enter credentials → test → choose models.
// A left rail lists existing connections to re-enter the flow. Primary
// affordance: hand-holding for first-time setup; test is a dedicated step with
// big loading/success/error states.

import { Button, cn } from "@statewalker/ui.view.shadcn";
import { useEffect, useState } from "react";
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
} from "./ui-bits.js";

const STEPS = ["Provider", "Credentials", "Test", "Models"];

export function VariantD() {
  const api = useMockConnections();
  const [wid, setWid] = useState<string | undefined>(undefined);
  const [step, setStep] = useState(0);
  const conn = api.connections.find((c) => c.id === wid);

  const startNew = () => {
    setWid(undefined);
    setStep(0);
  };
  const pickType = (t: ConnectionType) => {
    setWid(api.addCustom(t));
    setStep(1);
  };
  const openExisting = (c: Connection) => {
    setWid(c.id);
    setStep(c.status === "connected" ? 3 : 1);
  };

  return (
    <div className="mx-auto flex h-screen max-w-5xl">
      <aside className="w-64 shrink-0 border-r border-border p-4">
        <h2 className="mb-3 text-sm font-semibold">Connections</h2>
        <div className="space-y-1">
          {api.connections.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => openExisting(c)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm",
                c.id === wid ? "bg-accent" : "hover:bg-accent/50",
              )}
            >
              <Glyph type={c.type} className="text-base" />
              <span className="flex-1 truncate">{c.name}</span>
              <MiniStatus c={c} />
            </button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="mt-4 w-full"
          onClick={startNew}
        >
          + New connection
        </Button>
      </aside>

      <main className="flex-1 p-8">
        <Stepper step={conn ? step : 0} />
        <div className="mx-auto mt-10 max-w-md">
          {(!conn || step === 0) && <StepType onPick={pickType} />}
          {conn && step === 1 && (
            <StepCreds conn={conn} api={api} onNext={() => setStep(2)} />
          )}
          {conn && step === 2 && (
            <StepTest
              conn={conn}
              api={api}
              onBack={() => setStep(1)}
              onDone={() => setStep(3)}
            />
          )}
          {conn && step === 3 && <StepModels conn={conn} api={api} />}
        </div>
      </main>
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {STEPS.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <div
            className={cn(
              "flex size-7 items-center justify-center rounded-full text-xs font-semibold",
              i < step
                ? "bg-primary text-primary-foreground"
                : i === step
                  ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {i < step ? "✓" : i + 1}
          </div>
          <span
            className={cn(
              "text-sm",
              i === step ? "font-medium" : "text-muted-foreground",
            )}
          >
            {s}
          </span>
          {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-border" />}
        </div>
      ))}
    </div>
  );
}

function StepType({ onPick }: { onPick: (t: ConnectionType) => void }) {
  return (
    <div className="space-y-4">
      <h3 className="text-center text-lg font-semibold">Choose a provider</h3>
      <div className="grid grid-cols-2 gap-3">
        {PROVIDER_ORDER.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onPick(t)}
            className="flex flex-col items-center gap-2 rounded-xl border border-border p-5 transition-colors hover:border-foreground/30 hover:bg-accent"
          >
            <Glyph type={t} className="text-3xl" />
            <span className="font-medium">{PROVIDER_META[t].label}</span>
            <span className="text-[11px] text-muted-foreground">
              {PROVIDER_META[t].urlRequired ? "endpoint required" : "hosted"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function StepCreds({
  conn,
  api,
  onNext,
}: {
  conn: Connection;
  api: ConnectionsApi;
  onNext: () => void;
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-center text-lg font-semibold">
        Enter your {PROVIDER_META[conn.type].label} credentials
      </h3>
      <ConnFields c={conn} onChange={(p) => api.update(conn.id, p)} />
      <Button className="w-full" onClick={onNext}>
        Continue
      </Button>
    </div>
  );
}

function StepTest({
  conn,
  api,
  onBack,
  onDone,
}: {
  conn: Connection;
  api: ConnectionsApi;
  onBack: () => void;
  onDone: () => void;
}) {
  // Kick off the test as soon as we land on this step (run once on mount).
  useEffect(() => {
    api.test(conn.id);
  }, []);

  useEffect(() => {
    if (conn.status === "connected") {
      const t = setTimeout(onDone, 700);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [conn.status, onDone]);

  return (
    <div className="space-y-4 text-center">
      <h3 className="text-lg font-semibold">Testing connection</h3>
      {conn.status === "testing" && (
        <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
          <Spinner className="size-7" />
          <span>Contacting {PROVIDER_META[conn.type].label}…</span>
        </div>
      )}
      {conn.status === "connected" && (
        <div className="flex flex-col items-center gap-2 py-8 text-emerald-600 dark:text-emerald-400">
          <span className="text-4xl">✓</span>
          <span>Connected — found {conn.discoveredModels?.length} models</span>
        </div>
      )}
      {conn.status === "error" && (
        <div className="space-y-4 py-4">
          <div className="flex flex-col items-center gap-2 text-destructive">
            <span className="text-4xl">✕</span>
            <span className="font-medium">Couldn’t connect</span>
          </div>
          <ErrorNote message={conn.error} />
          <div className="flex justify-center gap-2">
            <Button variant="outline" onClick={onBack}>
              Edit credentials
            </Button>
            <Button onClick={() => api.test(conn.id)}>Retry</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function StepModels({ conn, api }: { conn: Connection; api: ConnectionsApi }) {
  return (
    <div className="space-y-4">
      <h3 className="text-center text-lg font-semibold">
        Choose models for chat
      </h3>
      <p className="text-center text-sm text-muted-foreground">
        Star the models you want available. {conn.starredModelIds.length}{" "}
        selected.
      </p>
      <div className="space-y-2">
        {conn.discoveredModels?.map((m) => {
          const on = conn.starredModelIds.includes(m.id);
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => api.toggleStar(conn.id, m.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                on
                  ? "border-amber-400/50 bg-amber-400/5"
                  : "border-border hover:bg-accent",
              )}
            >
              <span
                className={cn(
                  "text-lg",
                  on ? "text-amber-400" : "text-muted-foreground/40",
                )}
              >
                {on ? "★" : "☆"}
              </span>
              <span className="flex-1 text-sm font-medium">{m.label}</span>
              {m.capabilities?.map((cap) => (
                <CapTag key={cap} cap={cap} />
              ))}
            </button>
          );
        })}
      </div>
      <div className="rounded-md bg-emerald-500/10 px-3 py-2 text-center text-sm text-emerald-700 dark:text-emerald-400">
        ✓ {conn.name} is ready to use
      </div>
    </div>
  );
}
