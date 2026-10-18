import { Commands } from "@statewalker/shared-commands";
import { useAppWorkspace } from "@statewalker/ui.view.react";
import { LoadFileCommand } from "@statewalker/workspace.core";
import { type ReactElement, useEffect, useState } from "react";

interface ImageViewProps {
  uri: string;
}

/**
 * Bound to the `image-viewer` catalog's `ImageView` component type.
 * Lazy-loads the file via `files:load-file` on mount, builds a
 * `blob:` URL using the loaded MIME type (or `image/png` as a sensible
 * default), and renders an `<img>` against that URL. Revokes the URL
 * on unmount or URI change to avoid leaking object URLs.
 */
export function ImageView({ uri }: ImageViewProps): ReactElement {
  const workspace = useAppWorkspace();
  const commands = workspace.requireAdapter(Commands);

  const [state, setState] = useState<
    { kind: "loading" } | { kind: "ready"; url: string } | { kind: "error"; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    let revoke: (() => void) | null = null;
    let cancelled = false;
    setState({ kind: "loading" });
    const path = uri.replace(/^file:\/\//, "");
    commands
      .call(LoadFileCommand, { path })
      .promise.then((loaded) => {
        if (cancelled) return;
        const url = URL.createObjectURL(
          new Blob([loaded.bytes as BlobPart], {
            type: loaded.mimeType ?? "image/png",
          }),
        );
        revoke = () => URL.revokeObjectURL(url);
        setState({ kind: "ready", url });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      cancelled = true;
      revoke?.();
    };
  }, [uri, commands]);

  if (state.kind === "loading") {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-sm font-medium">Failed to load file</p>
        <p className="text-xs text-muted-foreground">{state.message}</p>
      </div>
    );
  }
  return (
    <div className="flex h-full items-center justify-center overflow-auto p-6">
      <img src={state.url} alt="" className="max-h-full max-w-full" />
    </div>
  );
}
