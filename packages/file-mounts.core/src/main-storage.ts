// The main storage is the open project: its system folder holds the project's settings. It must
// open before the vault's S3 keys are needed, so S3 cannot be main.
import type { MountConfig } from "./mount-config.js";
import type { ProfileData } from "./secret-vault.js";

export function canBeMain(config: Pick<MountConfig, "type">): boolean {
  return config.type === "opfs" || config.type === "local-folder" || config.type === "memory";
}

/** What a new profile starts with: browser storage as main, or memory where OPFS is missing. */
export function firstProfileData(opfs: boolean): Pick<ProfileData, "mounts" | "main"> {
  return {
    mounts: [
      { key: "browser", name: "Browser storage", type: opfs ? "opfs" : "memory", config: {} },
    ],
    main: "browser",
  };
}
