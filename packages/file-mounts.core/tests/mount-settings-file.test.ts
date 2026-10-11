import { readText, writeText } from "@statewalker/webrun-files";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { describe, expect, it } from "vitest";
import { loadMountConfigs, MOUNTS_FILE, saveMountConfigs } from "../src/index.js";

describe("mounts.json", () => {
  it("no file: no mounts, no problem; save then load round-trips", async () => {
    const files = new MemFilesApi();
    expect(await loadMountConfigs(files)).toEqual({ configs: [] });
    const configs = [
      { key: "archive", name: "Archive", type: "s3" as const, config: { bucket: "b" } },
    ];
    await saveMountConfigs(files, configs);
    expect(await loadMountConfigs(files)).toEqual({ configs });
    expect(MOUNTS_FILE).toBe("/.files/mounts.json");
  });

  it("a damaged file loads as no mounts with a problem, and is left untouched", async () => {
    const files = new MemFilesApi();
    await writeText(files, MOUNTS_FILE, "{ not json");
    const loaded = await loadMountConfigs(files);
    expect(loaded.configs).toEqual([]);
    expect(loaded.problem).toBe(
      "The storage settings file is damaged; it is kept as is until you save.",
    );
    expect(await readText(files, MOUNTS_FILE)).toBe("{ not json");
  });

  it("saving over a file that didn't load cleanly first keeps its bytes in a backup beside it", async () => {
    const files = new MemFilesApi();
    const damaged = JSON.stringify([
      { key: "ok", name: "Ok", type: "memory", config: {} },
      { key: "t", name: "Bad type", type: "ftp", config: {} },
    ]);
    await writeText(files, MOUNTS_FILE, damaged);
    expect((await loadMountConfigs(files)).problem).toBe(
      "1 saved storage could not be read and was left out.",
    );
    const configs = [{ key: "new", name: "New", type: "memory" as const, config: {} }];
    await saveMountConfigs(files, configs);
    expect(await loadMountConfigs(files)).toEqual({ configs });
    const backups = [];
    for await (const e of files.list("/.files")) {
      if (e.name.startsWith("mounts.damaged-")) backups.push(e.path);
    }
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatch(/^\/\.files\/mounts\.damaged-.+\.json$/);
    expect(await readText(files, backups[0] ?? "")).toBe(damaged);
  });

  it("saving over a clean file makes no backup", async () => {
    const files = new MemFilesApi();
    await saveMountConfigs(files, []);
    await saveMountConfigs(files, [{ key: "a", name: "A", type: "memory", config: {} }]);
    const names = [];
    for await (const e of files.list("/.files")) names.push(e.name);
    expect(names).toEqual(["mounts.json"]);
  });

  it("entries that can't be used are left out and counted", async () => {
    const files = new MemFilesApi();
    await writeText(
      files,
      MOUNTS_FILE,
      JSON.stringify([
        { key: "ok", name: "Ok", type: "memory", config: {} },
        { key: "ok", name: "Twice", type: "memory", config: {} },
        { key: ".hidden", name: "Bad key", type: "memory", config: {} },
        { key: "t", name: "Bad type", type: "ftp", config: {} },
      ]),
    );
    const loaded = await loadMountConfigs(files);
    expect(loaded.configs.map((c) => c.key)).toEqual(["ok"]);
    expect(loaded.problem).toBe("3 saved storages could not be read and were left out.");
  });
});
