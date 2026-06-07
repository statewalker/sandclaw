import type { Answer } from "@statewalker/resources-wiki";
import { useRef, useState } from "react";

export type SearchStatus = "idle" | "running" | "done" | "error";

/** One step of a `WikiQuery` run, as streamed from `/api/query`. */
export interface QueryStage {
  name: string;
  status: "running" | "done" | "failed";
}

type QueryEvent =
  | { kind: "stage"; stages: QueryStage[] }
  | { kind: "answer"; answer: Answer }
  | { kind: "error"; message: string };

/**
 * Drives a live vault search against `/api/query` (NDJSON stream of stage
 * snapshots → final answer) plus saving the answer via `/api/answers`. Lifted
 * out of the view so both the Search tab and a clicked retrieval suggestion can
 * trigger the same `run(question)`.
 */
export function useVaultSearch(project: string) {
  const [query, setQuery] = useState("");
  const [asked, setAsked] = useState("");
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [stages, setStages] = useState<QueryStage[]>([]);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function run(question: string) {
    const q = question.trim();
    if (!q) return;
    setQuery(q);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setAsked(q);
    setStatus("running");
    setStages([]);
    setAnswer(null);
    setError(null);
    setSaved(null);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project, question: q }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const msg = await res.text().catch(() => "");
        throw new Error(msg || `request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        // biome-ignore lint/suspicious/noAssignInExpressions: stream line split
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line) as QueryEvent;
          if (ev.kind === "stage") setStages(ev.stages);
          else if (ev.kind === "answer") {
            setAnswer(ev.answer);
            setStatus("done");
          } else {
            setError(ev.message);
            setStatus("error");
          }
        }
      }
      setStatus((s) => (s === "running" ? "done" : s));
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  async function save() {
    if (!answer || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/answers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project, question: asked, answer }),
      });
      const data = (await res.json()) as { file?: string; error?: string };
      if (!res.ok || !data.file) throw new Error(data.error || "save failed");
      setSaved(data.file);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return {
    query,
    setQuery,
    asked,
    status,
    stages,
    answer,
    error,
    saved,
    saving,
    run,
    save,
  };
}
