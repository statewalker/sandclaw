import type { Problem } from "../file-panels/problem.js";
import type { S3Form } from "./mount-config.js";
import { type CheckId, classifyS3Error } from "./s3-problems.js";

export interface S3Probe {
  /** An unsigned no-cors fetch: true when the host answers at all. */
  hostAnswers(): Promise<boolean>;
  /** Throws an S3-like error when the check fails. */
  check(id: CheckId): Promise<void>;
}

export interface ConnectionReport {
  ok: boolean;
  checks: { id: CheckId; label: string; state: "ok" | "failed" | "skipped" | "not-run" }[];
  problem?: Problem;
}

const LABELS: Record<CheckId, string> = {
  endpoint: "The address answers",
  keys: "The keys are accepted",
  bucket: "The bucket exists",
  list: "Listing is allowed",
  write: "Writing is allowed",
};
const ORDER: CheckId[] = ["endpoint", "keys", "bucket", "list", "write"];

const CANCELLED = Symbol("cancelled");

function isNetworkError(error: unknown): boolean {
  const e = error as { name?: string; message?: string } | null;
  return (
    e?.name === "NetworkError" ||
    (e?.name === "TypeError" && !!e.message?.includes("Failed to fetch"))
  );
}

/** Runs one check, ending it with a TimeoutError after `timeoutMs` or with CANCELLED on abort. */
function runCheck(
  probe: S3Probe,
  id: CheckId,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      finish();
      reject(CANCELLED);
    };
    const timer = setTimeout(() => {
      finish();
      const timeout = new Error("The check timed out");
      timeout.name = "TimeoutError";
      reject(timeout);
    }, timeoutMs);
    if (signal?.aborted) return onAbort();
    signal?.addEventListener("abort", onAbort);
    probe.check(id).then(
      () => {
        finish();
        resolve();
      },
      (error) => {
        finish();
        reject(error);
      },
    );
  });
}

export async function runConnectionTest(
  probe: S3Probe,
  form: Pick<S3Form, "endpoint" | "bucket" | "readOnly">,
  opts: { origin: string; signal?: AbortSignal; timeoutMs?: number },
): Promise<ConnectionReport> {
  const checks: ConnectionReport["checks"] = ORDER.map((id) => ({
    id,
    label: LABELS[id],
    state: "not-run",
  }));
  for (const entry of checks) {
    if (entry.id === "write" && form.readOnly) {
      entry.state = "skipped";
      continue;
    }
    try {
      await runCheck(probe, entry.id, opts.timeoutMs ?? 15000, opts.signal);
      entry.state = "ok";
    } catch (error) {
      if (error === CANCELLED) return { ok: false, checks };
      entry.state = "failed";
      const hostAnswers = isNetworkError(error) ? await probe.hostAnswers() : undefined;
      const problem = classifyS3Error(error, {
        check: entry.id,
        endpoint: form.endpoint,
        bucket: form.bucket,
        origin: opts.origin,
        hostAnswers,
      });
      return { ok: false, checks, problem };
    }
  }
  return { ok: true, checks };
}

export type ProbeScenario =
  | "ok"
  | "bad-keys"
  | "clock-skew"
  | "no-bucket"
  | "denied-list"
  | "denied-write"
  | "cors"
  | "unreachable"
  | "timeout";

const FAILURES: Partial<Record<ProbeScenario, { id: CheckId; error: () => unknown }>> = {
  "bad-keys": {
    id: "keys",
    error: () => ({ name: "InvalidAccessKeyId", message: "The access key ID does not exist." }),
  },
  "clock-skew": {
    id: "keys",
    error: () => ({
      name: "RequestTimeTooSkewed",
      message: "The difference between the request time and the server's time is too large.",
    }),
  },
  "no-bucket": {
    id: "bucket",
    error: () => ({ name: "NoSuchBucket", message: "The specified bucket does not exist." }),
  },
  "denied-list": { id: "list", error: () => ({ name: "AccessDenied", message: "Access Denied" }) },
  "denied-write": {
    id: "write",
    error: () => ({ name: "AccessDenied", message: "Access Denied" }),
  },
  cors: { id: "endpoint", error: () => new TypeError("Failed to fetch") },
  unreachable: { id: "endpoint", error: () => new TypeError("Failed to fetch") },
};

/** A scripted probe for stories and tests; each check waits `delayMs` so progress is visible. */
export function fakeProbe(scenario: ProbeScenario, delayMs = 0): S3Probe {
  const wait = () =>
    delayMs > 0 ? new Promise<void>((r) => setTimeout(r, delayMs)) : Promise.resolve();
  return {
    async hostAnswers() {
      return scenario === "cors";
    },
    async check(id) {
      await wait();
      if (scenario === "timeout" && id === "endpoint") return new Promise<void>(() => {});
      const failure = FAILURES[scenario];
      if (failure && failure.id === id) throw failure.error();
    },
  };
}
