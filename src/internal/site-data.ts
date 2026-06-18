import { Commands } from "@statewalker/shared-commands";
import { useAppWorkspace } from "@statewalker/ui.view.react";
import type { SiteManifest } from "@statewalker/wiki";
import { LoadFileCommand } from "@statewalker/workspace.core";
import { useEffect, useState } from "react";

/** Workspace-absolute path of a site's `site.json` manifest. */
export function siteJsonPath(project: string, slug: string): string {
  return `/${project}/sites/${slug}/site.json`;
}

/** Workspace-absolute path of a generated page (manifest `page.path` is a file name). */
export function pageUri(project: string, slug: string, pagePath: string): string {
  return `/${project}/sites/${slug}/${pagePath}`;
}

export type ManifestState =
  | { status: "loading" }
  | { status: "ready"; manifest: SiteManifest }
  | { status: "empty" }
  | { status: "error"; message: string };

/** Load a site's manifest via `files:load-file`. A missing file resolves to `empty`. */
export function useSiteManifest(project: string, slug: string): ManifestState {
  const workspace = useAppWorkspace();
  const commands = workspace.requireAdapter(Commands);
  const [state, setState] = useState<ManifestState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    commands
      .call(LoadFileCommand, { path: siteJsonPath(project, slug) })
      .promise.then((loaded) => {
        if (cancelled) return;
        try {
          const manifest = JSON.parse(new TextDecoder().decode(loaded.bytes)) as SiteManifest;
          setState({ status: "ready", manifest });
        } catch (error) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: "empty" });
      });
    return () => {
      cancelled = true;
    };
  }, [project, slug, commands]);

  return state;
}

export type FileTextState =
  | { status: "loading" }
  | { status: "ready"; text: string }
  | { status: "error"; message: string };

/** Load a markdown page's text via `files:load-file`. */
export function useFileText(uri: string): FileTextState {
  const workspace = useAppWorkspace();
  const commands = workspace.requireAdapter(Commands);
  const [state, setState] = useState<FileTextState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    commands
      .call(LoadFileCommand, { path: uri.replace(/^file:\/\//, "") })
      .promise.then((loaded) => {
        if (cancelled) return;
        setState({ status: "ready", text: new TextDecoder().decode(loaded.bytes) });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [uri, commands]);

  return state;
}
