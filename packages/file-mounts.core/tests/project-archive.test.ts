import { readText, writeText } from "@statewalker/webrun-files";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { describe, expect, it } from "vitest";
import {
  archiveProfile,
  canBeMain,
  firstProfileData,
  importProfile,
  MemoryStore,
  type MountConfig,
  mergeImported,
  type ProfileData,
  Profiles,
} from "../src/index.js";

const s3: MountConfig = { key: "archive", name: "Archive", type: "s3", config: { bucket: "b" } };
const notes: MountConfig = { key: "notes", name: "Notes", type: "opfs", config: {} };

describe("the main storage", () => {
  it("only browser storage, a local folder or memory can be main", () => {
    expect(canBeMain({ type: "opfs" })).toBe(true);
    expect(canBeMain({ type: "local-folder" })).toBe(true);
    expect(canBeMain({ type: "memory" })).toBe(true);
    expect(canBeMain({ type: "s3" })).toBe(false);
  });

  it("a first profile starts with browser storage as main, or memory without OPFS", () => {
    expect(firstProfileData(true)).toEqual({
      mounts: [{ key: "browser", name: "Browser storage", type: "opfs", config: {} }],
      main: "browser",
    });
    expect(firstProfileData(false).mounts[0]?.type).toBe("memory");
  });
});

describe("archive copies in a project", () => {
  it("writes the mounts and preferences, never the secrets; import reads them back", async () => {
    const vault = await new Profiles({
      records: new MemoryStore<unknown>(),
      iterations: 1000,
    }).create("Work", "pw", false, { ...firstProfileData(true), preferences: { theme: "dark" } });
    await vault.set("archive/secretAccessKey", "s3cr3t-value");
    await vault.update((d) => ({ ...d, mounts: [...d.mounts, s3] }));
    const project = new MemFilesApi();
    await archiveProfile(project, await vault.read());

    const mounts = await readText(project, "/.settings/mounts.json");
    expect(mounts).toContain("Archive");
    expect(mounts).not.toContain("s3cr3t-value");
    expect(await readText(project, "/.settings/preferences.json")).not.toContain("s3cr3t-value");
    expect(await importProfile(project)).toEqual({
      mounts: [firstProfileData(true).mounts[0], s3],
      preferences: { theme: "dark" },
    });
  });

  it("import keeps what the profile has and adds the rest", () => {
    const data: ProfileData = {
      secrets: { "archive/k": "v" },
      mounts: [{ ...s3, name: "Mine" }],
      main: "archive",
      preferences: { theme: "light" },
    };
    const merged = mergeImported(data, {
      mounts: [s3, notes],
      preferences: { theme: "dark", density: "compact" },
    });
    expect(merged).toEqual({
      secrets: { "archive/k": "v" },
      mounts: [{ ...s3, name: "Mine" }, notes],
      main: "archive",
      preferences: { theme: "light", density: "compact" },
    });
  });

  it("a damaged archive brings in only what can be read, and says what was left out", async () => {
    const project = new MemFilesApi();
    await writeText(
      project,
      "/.settings/mounts.json",
      JSON.stringify([notes, { key: "", name: 1 }]),
    );
    await writeText(project, "/.settings/preferences.json", "{ not json");
    expect(await importProfile(project)).toEqual({
      mounts: [notes],
      preferences: {},
      problem:
        "1 saved storage could not be read and was left out. The archived preferences are damaged; they were left out.",
    });
  });

  it("a project with no archive imports nothing, without a problem", async () => {
    expect(await importProfile(new MemFilesApi())).toEqual({ mounts: [], preferences: {} });
  });
});
