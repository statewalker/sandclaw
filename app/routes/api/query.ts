import { QueryProgress, WikiQueryCommand } from "@repo/wiki-runtime/embed";
import { createRoute } from "honox/factory";
import { commands } from "@/lib/query-runtime";

/** Unwrap a `CommandError` to its underlying cause for a readable message. */
function errorMessage(err: unknown): string {
  if (
    err &&
    typeof err === "object" &&
    "cause" in err &&
    err.cause instanceof Error
  ) {
    return err.cause.message;
  }
  return err instanceof Error ? err.message : String(err);
}

/**
 * Stream a live wiki query as newline-delimited JSON. Each line is one event:
 *   { kind: "stage", stages }   — a snapshot of the QueryProgress stage list
 *   { kind: "answer", answer }  — the final Answer (report-section shape)
 *   { kind: "error", message }  — a failed stage / bootstrap error
 * The query runs as the `WikiQueryCommand` use case; we observe its progress
 * observable and forward every transition, then settle with the command result.
 */
export const POST = createRoute(async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    project?: string;
    question?: string;
  } | null;
  const project = body?.project?.trim();
  const question = body?.question?.trim();
  if (!project || !question) {
    return c.json({ error: "missing 'project' or 'question'" }, 400);
  }

  const progress = new QueryProgress(question);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const enqueue = (obj: unknown) => {
        if (!closed)
          controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      };
      const off = progress.onStageChange(() =>
        enqueue({ kind: "stage", stages: progress.stages }),
      );

      commands()
        .call(WikiQueryCommand, { project, question, progress })
        .promise.then((answer) => enqueue({ kind: "answer", answer }))
        .catch((err) => enqueue({ kind: "error", message: errorMessage(err) }))
        .finally(() => {
          off();
          closed = true;
          controller.close();
        });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
});
