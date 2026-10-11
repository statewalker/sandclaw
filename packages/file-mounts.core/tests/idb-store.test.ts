import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { IdbStore } from "../src/index.js";

describe("IdbStore", () => {
  it("keeps values across instances of the same name, and deletes them", async () => {
    await new IdbStore<string>("test-store").set("a", "one");
    const store = new IdbStore<string>("test-store");
    expect(await store.get("a")).toBe("one");
    await store.delete("a");
    expect(await store.get("a")).toBeUndefined();
  });
});
