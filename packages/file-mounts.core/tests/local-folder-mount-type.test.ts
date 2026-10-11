import { describe, expect, it } from "vitest";
import { localFolderMountType, MemoryStore, NeedsUserGesture } from "../src/index.js";

const fakeHandle = (permission: "granted" | "prompt" | "denied", afterRequest = permission) =>
  ({
    kind: "directory",
    name: "Projects",
    queryPermission: async () => permission,
    requestPermission: async () => afterRequest,
  }) as unknown as FileSystemDirectoryHandle;

describe("localFolderMountType", () => {
  const mount = {
    key: "home",
    name: "Home",
    type: "local-folder" as const,
    config: { handleId: "h1", directory: "Projects" },
  };

  it("is unavailable without the File System Access API, with the reason to show", () => {
    expect(localFolderMountType(new MemoryStore()).isAvailable()).toEqual({
      ok: false,
      reason: "This browser can't open local folders; use Chrome or Edge.",
    });
  });

  it("without permission: NeedsUserGesture at start-up, a request when the person clicks", async () => {
    const handles = new MemoryStore<FileSystemDirectoryHandle>();
    await handles.set("h1", fakeHandle("prompt", "granted"));
    const type = localFolderMountType(handles);
    await expect(
      type.create(mount, { interactive: false, secret: async () => undefined }),
    ).rejects.toBeInstanceOf(NeedsUserGesture);
    await expect(
      type.create(mount, { interactive: true, secret: async () => undefined }),
    ).resolves.toBeDefined();
  });

  it("a refused request and a forgotten handle each fail with a reason", async () => {
    const handles = new MemoryStore<FileSystemDirectoryHandle>();
    await handles.set("h1", fakeHandle("prompt", "denied"));
    const type = localFolderMountType(handles);
    const ctx = { interactive: true, secret: async () => undefined };
    await expect(type.create(mount, ctx)).rejects.toThrow("Access to Projects was refused.");
    await type.forget?.(mount);
    await expect(type.create(mount, ctx)).rejects.toThrow(
      "This folder was forgotten; choose it again.",
    );
  });
});
