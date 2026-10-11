# @statewalker/file-panels.core

## What it is

The logic behind a file panel, without any rendering: a `PanelModel` that lists one folder of the
mounted storages into `@statewalker/explorer.core`'s `FilesListModel`, a safe copy and move across
storages with byte progress, file operations (create folder, rename, delete, transfer) that report
what they changed, a breadcrumb, desktop-drop import, and the interfaces a search provider
implements. React-free.

## Why it exists

`FilesListModel` holds entries, sort, filter, cursor and selection, but does no I/O and knows
nothing about storages that can be locked or unreachable. A panel manager needs more: the reason a
folder cannot be read, the nearest folder that still exists when one disappears, refreshes when
another panel changes the same folder, and copies between a local folder and an S3 bucket that
never leave a half-written target behind. This package is that layer, so the views stay thin.

## How to use

```ts
import { newFileChanges } from "@statewalker/file-mounts.core";
import { FileOperations, PanelModel } from "@statewalker/file-panels.core";

const changes = newFileChanges();            // the one stream of changes
const ops = new FileOperations(files, changes); // files: the mounted storages (a FilesApi)
const panel = new PanelModel({
  id: "left",
  files,
  changes,
  mountNames: () => ({ docs: "Documents" }),  // display names for the first path segment
});

await panel.navigate("/docs/clients");
panel.list.getVisibleEntries();               // what the view shows
panel.problem;                                // set when the folder cannot be read
panel.breadcrumb();                           // [{ name: "Documents", path: "/docs", isMount: true }, ...]
```

## Examples

### A panel shows why a folder cannot be read

```ts
await panel.navigate("/archive");
panel.problem;  // { cause: "locked", message: "Locked: unlock to use the S3 storages." }
panel.list.entries; // [] : a locked storage is a problem, not an empty folder
```

### A folder that vanished moves the panel up, with a notice

```ts
await panel.navigate("/docs/clients/gone/deeper");
panel.state.path; // "/docs/clients"
panel.notice;     // "deeper no longer exists."
```

### Copy and move with progress and cancel

```ts
import { planTransfer } from "@statewalker/file-panels.core"; // only for the clash dialog

const controller = new AbortController();
const { plan, result } = await ops.transfer(
  { op: "move", sources: ["/docs/a.pdf"], targetDir: "/archive/2026", clash: "keep-both" },
  { signal: controller.signal, onProgress: (p) => console.log(p.bytesDone, "/", p.bytesTotal) },
);
result.failed; // [{ path, problem: { message } }]: one entry per step that did not complete
```

`transfer` throws `plan.invalid` (for example "A folder can't be copied or moved into itself.")
before touching anything. To show the clash dialog first, call `planTransfer(files, request)`
yourself: `plan.clashes` names the taken names.

### Folder operations

```ts
await ops.mkdir("/docs", "reports");      // returns the new path; refuses a taken name
await ops.rename("/docs/a.pdf", "b.pdf"); // returns the new path
await ops.remove(["/docs/b.pdf"]);
```

### A desktop drop becomes a source

```ts
import { importDropped } from "@statewalker/file-panels.core";

element.addEventListener("drop", async (event) => {
  event.preventDefault();
  const dropped = await importDropped(event.dataTransfer);   // { files, paths }
  await ops.transfer(
    { op: "copy", sources: dropped.paths, targetDir: panel.state.path, clash: "keep-both" },
    { files: dropped.files },
  );
});
```

### Persisting the layout

`panel.state` is `{ id, path, sort: { field, descending } }`: what a dock layout saves and restores.

## Internals

### The transfer never leaves a partial or silently replaced target

Each step is written under a hidden sibling name (`.<name>.part-<random>`) and swapped into place
only when complete. This is the reason a cancel or a failure leaves nothing partial under the real
name, and why an overwritten folder is replaced rather than merged: the old one is set aside
(`.<name>.old-<random>`), the new one moved in, then the old one removed. Copying straight into the
target would merge folders and leave half a file behind on cancel; neither is acceptable when the
target is the only copy of someone's data.

What the person sees when something goes differently than planned:

| Situation | Message |
| --- | --- |
| The name was free when planned and taken since, without overwrite | "`name` appeared there meanwhile; nothing was replaced." |
| A move copied everything, but the source changed or grew while it ran | "It changed during the move: the copy is done, and `from` keeps what changed." |
| The source is gone when the step starts or ends | "It no longer exists." |
| The item is the target or contains it | "An item can't be copied or moved into itself." |
| Swapping in failed and the old target could not be put back | the cause, then "The old version is kept as `.name.old-xxxx`." |
| Rename or create onto a taken name | "`name` already exists here." |

A move deletes only what it copied unchanged: each source file is removed only if its size and
modification time still match what was copied, and folders only once empty. A failed step does not
stop the others; `result.failed` has one entry per failed step and `result.done` the rest. Cancel
returns `result.cancelled: true` and removes the temporary sibling of the file in flight.

The hidden names matter when they surface: a crash, or a failed rollback, can leave a `.name.part-*`
or `.name.old-*` folder next to the target. The latter holds the previous version and the failed
rollback message names its path.

### Overwriting a folder on S3 costs a server-side copy and delete per object

S3 has no rename. The final move of the temporary sibling into place is a server-side copy followed
by a delete for every object under it, so replacing a large folder on a bucket takes time
proportional to its object count, even though no bytes are downloaded. Within one storage a copy
is delegated to the backend (`files.copy` / `files.move`) and overwrites go through the same
temporary-sibling swap.

### The remaining window

Whether a target exists is checked just before the write or the swap, not atomically with it. Two
writers racing for the same name inside that gap can still replace each other. Closing it needs
conditional writes (`If-None-Match`) from the storage itself, which `FilesApi` does not expose.

### The change stream and who listens

`FileOperations` emits `FileChange` events (`added`, `updated`, `deleted`) on the hub it is given,
reporting what is really on disk: a failed transfer step still reports a target that was written
and a source that was partly cleaned. With `opts.files` (a drop) no source-side events are emitted,
since those paths mean nothing to listeners. `PanelModel` subscribes to the optional `changes` and
refreshes when a change is inside the folder it was last asked to show (even while that listing is still loading, so a change in the previous folder never cancels the navigation), is that folder itself, or is one of its ancestors; any
other change is ignored. Call `dispose()` to unsubscribe; it also makes any listing still in flight be ignored, so a disposed panel never writes to its list or notifies. A later indexer is meant to follow the
same stream.

### Newest navigation wins

`navigate` lists the whole folder before touching the `FilesListModel`, and each call carries a
sequence number. A slow listing that finishes after a newer `navigate` returns without writing, so
the newer folder's entries are never replaced. Listing first also means the list is not blanked
for a folder that turns out to be unreadable until the result is known.

### Why `importDropped` reads entries before the first `await`

Browsers empty a `DataTransfer` once the drop handler returns synchronously. `importDropped` takes
`webkitGetAsEntry()` for every item first, then reads the files asynchronously into a `MemFilesApi`
under `/drop/...`. If it awaited first, the drop would look empty. Where the browser has no
entries API only the plain files are taken, so dropped folders are lost there.

### Search is an interface only

`SearchProvider` (`id`, `search(query, { scope, signal })` yielding `SearchHit`) and `SearchHit`
(`path`, `title`, `snippet?`, `score`) are types; nothing in this package implements them. They are
the seam where a full-text index over the mounts plugs in later.

### Constraints and dependencies

- `PanelModel` identifies a storage by the first path segment; `runTransfer` takes a `mountOf`
  option to override that when the mount table differs.
- The target folder must be inside a storage: `/` is refused ("Choose a folder inside a storage.").
- Depends on `@statewalker/explorer.core` (the list model), `@statewalker/file-mounts.core`
  (`FileChanges`, `Problem`, `problemOf`), `@statewalker/shared-baseclass` (`BaseClass`),
  `@statewalker/webrun-files` (`FilesApi`, path helpers) and `@statewalker/webrun-files-mem`
  (the drop's in-memory storage).

## License

MIT
