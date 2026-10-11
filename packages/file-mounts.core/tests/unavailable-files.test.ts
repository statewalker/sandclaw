import { describe, expect, it } from "vitest";
import { MountUnavailable, newFileChanges, problemOf, unavailableFiles } from "../src/index.js";

describe("unavailableFiles", () => {
  const problem = { cause: "locked" as const, message: "Locked: unlock to use the S3 storages." };

  it("raises the mount's problem from every operation, listing included", async () => {
    const files = unavailableFiles("archive", problem);
    const listing = async () => {
      for await (const _ of files.list("/")) break;
    };
    await expect(listing()).rejects.toBeInstanceOf(MountUnavailable);
    await expect(files.exists("/a")).rejects.toThrow("Locked: unlock to use the S3 storages.");
    const error = await files.stats("/a").catch((e: unknown) => e);
    expect(problemOf(error)).toEqual(problem);
    expect((error as MountUnavailable).mount).toBe("archive");
  });
});

describe("newFileChanges", () => {
  it("sends each batch to every subscriber until it unsubscribes; empty batches are dropped", () => {
    const hub = newFileChanges();
    const seen: string[][] = [];
    const stop = hub.subscribe((changes) => seen.push(changes.map((c) => `${c.type} ${c.path}`)));
    hub.emit([{ type: "added", path: "/a/x.md" }]);
    hub.emit([]);
    stop();
    hub.emit([{ type: "deleted", path: "/a/x.md" }]);
    expect(seen).toEqual([["added /a/x.md"]]);
  });
});
