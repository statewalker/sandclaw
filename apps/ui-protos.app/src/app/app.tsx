import { useRef, useState } from "react";
import type { Commander } from "../file-panels/use-commander.js";
import type { Viewer } from "../settings/settings-model.js";
import type { Mode } from "../workspace-layout/responsive.js";
import { activity } from "./features/activity.js";
import { assistant } from "./features/assistant.js";
import { core } from "./features/core.js";
import { files } from "./features/files.js";
import { indexing } from "./features/indexing.js";
import { mesh } from "./features/mesh.js";
import { sites } from "./features/sites.js";
import { todos } from "./features/todos.js";
import {
  type AppRuntime,
  AppRuntimeContext,
  contributeAll,
  createRuntime,
  type Feature,
} from "./runtime.js";
import { AppShell } from "./shell/app-shell.js";

export const allFeatures: Feature[] = [
  core,
  files,
  todos,
  sites,
  indexing,
  assistant,
  activity,
  mesh,
];

export interface AppProps {
  /** Claire (admin) or Hugo (member): a member gets no admin menus, views or settings. */
  viewer?: Viewer;
  /** The ids of the features switched on (`allFeatures`); all by default. */
  features?: string[];
  initialMode?: Mode;
  /** The buses to use; tests pass one to read what the features contributed. */
  runtime?: AppRuntime;
}

/**
 * The whole app, signed in to a mesh. Changing the viewer or the features
 * starts a new App (`key`), so contributions are made once and never patched.
 * Contributions are not disposed on unmount: they live in the buses the App
 * made for itself, which are dropped with it, and none of them touches anything
 * outside. A `runtime` passed in is a test seam: it is contributed to once per
 * mount, so a test must not rerender or remount the App with the same one.
 */
export function App({
  viewer = "admin",
  features = allFeatures.map((f) => f.id),
  initialMode,
  runtime,
}: AppProps) {
  return (
    <AppInstance
      key={`${viewer}:${features.join(",")}`}
      viewer={viewer}
      features={features}
      initialMode={initialMode}
      runtime={runtime}
    />
  );
}

function AppInstance({
  viewer,
  features,
  initialMode,
  runtime,
}: Required<Pick<AppProps, "viewer" | "features">> & Pick<AppProps, "initialMode" | "runtime">) {
  const commander = useRef<Commander | null>(null);
  const [rt] = useState(() => {
    const rt = runtime ?? createRuntime();
    contributeAll(
      rt,
      allFeatures.filter((f) => features.includes(f.id)),
      { viewer, commander },
    );
    return rt;
  });
  return (
    <AppRuntimeContext.Provider value={rt}>
      <AppShell commanderRef={commander} initialMode={initialMode} />
    </AppRuntimeContext.Provider>
  );
}
