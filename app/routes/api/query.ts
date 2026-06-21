import { WikiQuery } from "@statewalker/wiki.core";
import { createRoute } from "honox/factory";
import { getProject } from "@/lib/wiki-repo";

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
 *   { kind: "answer", answer }  — the final Answer
 *   { kind: "error", message }  — a failed stage / bootstrap error
 * The query runs through the project's `WikiQuery` adapter; we subscribe to the
 * returned `QueryProgress` and forward every stage transition, then settle with
 * the resolved answer.
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

  const proj = await getProject(project);
  if (!proj) return c.json({ error: `unknown project '${project}'` }, 404);
  const query = proj.requireAdapter(WikiQuery);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const enqueue = (obj: unknown) => {
        if (!closed)
          controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      };

      const progress = query.ask(question);
      const off = progress.onChange(() =>
        enqueue({ kind: "stage", stages: progress.stages }),
      );
      // The reformulate stage is pushed synchronously inside `ask`, before we
      // subscribe — emit one initial snapshot so it is never missed.
      enqueue({ kind: "stage", stages: progress.stages });

      progress
        .complete()
        .then((answer) => enqueue({ kind: "answer", answer }))
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
