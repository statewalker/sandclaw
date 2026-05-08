import { newIntent } from "@statewalker/shared-intents";
import type { DirectoryEntry, LoadedFile } from "./types.js";

export interface LoadDirectoryPayload {
  /** Workspace-relative path. Defaults to `/` when omitted. */
  path?: string;
  /** Recursive listing (descends into subdirectories). */
  recursive?: boolean;
}
export const [runLoadDirectory, handleLoadDirectory] = newIntent<
  LoadDirectoryPayload,
  readonly DirectoryEntry[]
>("files:load-directory");

export interface LoadFilePayload {
  path: string;
}
export const [runLoadFile, handleLoadFile] = newIntent<
  LoadFilePayload,
  LoadedFile
>("files:load-file");

export interface WriteFilePayload {
  path: string;
  content: Uint8Array | string;
}
export const [runWriteFile, handleWriteFile] = newIntent<
  WriteFilePayload,
  void
>("files:write-file");

export interface MoveFilePayload {
  fromPath: string;
  toPath: string;
}
export const [runMoveFile, handleMoveFile] = newIntent<MoveFilePayload, void>(
  "files:move-file",
);

export interface DeleteFilePayload {
  path: string;
}
export const [runDeleteFile, handleDeleteFile] = newIntent<
  DeleteFilePayload,
  void
>("files:delete-file");

export interface VisualizeFilePayload {
  /**
   * `file://` URI or workspace-relative path. The handler resolves
   * MIME type from the extension, picks a `MimeRenderer` from the
   * `files:mime-renderers` slot, and opens a DockView panel.
   */
  uri: string;
}
export const [runVisualizeFile, handleVisualizeFile] = newIntent<
  VisualizeFilePayload,
  void
>("files:visualize");
