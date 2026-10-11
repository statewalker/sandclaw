import type { FilesApi } from "@statewalker/webrun-files";
import type { MountConfig, MountTypeId } from "./mount-config.js";

export interface MountField {
  name: string;
  label: string;
  kind: "text" | "secret" | "url" | "boolean" | "select";
  required?: boolean;
  options?: { value: string; label: string }[];
  default?: string;
}

export interface MountContext {
  /** A user gesture is available: permission prompts may be shown. */
  interactive: boolean;
  /**
   * A secret field of this mount from the vault; undefined when there is no vault,
   * throws SecretsLocked when it is locked.
   */
  secret(field: string): Promise<string | undefined>;
}

export interface MountType {
  readonly id: MountTypeId;
  readonly label: string;
  readonly fields: MountField[];
  /** `create` may wait on a permission prompt: an interactive create is not timed out. */
  readonly prompts?: true;
  isAvailable(): { ok: true } | { ok: false; reason: string };
  create(mount: MountConfig, ctx: MountContext): Promise<FilesApi>;
  /** Drops what the type stored for the mount (a folder handle). */
  forget?(mount: MountConfig): Promise<void>;
}

/** The folder needs a click to grant access again (after a reload). */
export class NeedsUserGesture extends Error {
  constructor() {
    super("A click is needed to give access again.");
    this.name = "NeedsUserGesture";
  }
}
