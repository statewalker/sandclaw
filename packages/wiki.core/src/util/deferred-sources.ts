import { type Project, SOURCES_COLLECTION, type TaskContext } from "@statewalker/workspace.core";

/**
 * Helpers for a reduce builder's full pass (no saved state) over documents an external
 * artifact (an index) still holds but its input collection does not list. Such a document
 * is *gone* when it was scanned without reaching the input (its `sources` row exists) or
 * its file is deleted; otherwise it is *deferred* — not scanned yet (a scan batch still to
 * come, e.g. the first build after an upgrade) — and re-checked on later runs.
 */

/** Whether the source file of a project-relative uri exists. */
async function sourceExists(project: Project, uri: string): Promise<boolean> {
  return (await project.workspace.files.stats(project.resolveProjectPath(uri))) != null;
}

/** Whether an unlisted document is gone (scanned without an input row, or deleted). */
export async function isSourceGone(
  ctx: TaskContext,
  project: Project,
  uri: string,
): Promise<boolean> {
  if ((await ctx.get(SOURCES_COLLECTION, uri)) !== undefined) return true;
  return !(await sourceExists(project, uri));
}

/**
 * Re-check the documents a full pass deferred: one that now has an `input` row is settled
 * (its change flows through `ctx.changes`); one that is gone is returned in `gone`; the
 * rest stay `pending`.
 */
export async function settleDeferred(
  ctx: TaskContext,
  project: Project,
  input: string,
  deferred: readonly string[],
): Promise<{ gone: string[]; pending: string[] }> {
  const gone: string[] = [];
  const pending: string[] = [];
  for (const uri of deferred) {
    if ((await ctx.get(input, uri)) !== undefined) continue;
    if (await isSourceGone(ctx, project, uri)) gone.push(uri);
    else pending.push(uri);
  }
  return { gone, pending };
}
