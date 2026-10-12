import { readText } from "@statewalker/webrun-files";
import { describe, expect, it } from "vitest";
import { newAppStorages, worldPath } from "../src/app/world.js";
import { folder } from "../src/mock.js";

describe("the App's world", () => {
  it("the folder's files are real files under /documents, with their text", async () => {
    const { files } = newAppStorages();
    expect(worldPath("Notes/todo.md")).toBe("/documents/Notes/todo.md");
    const todo = folder
      .find((e) => e.name === "Notes")
      ?.children?.find((e) => e.name === "todo.md")?.text;
    expect(await readText(files, worldPath("Notes/todo.md"))).toBe(todo);
    expect(await files.stats(worldPath("Clients/Dupont — offer.docx"))).toMatchObject({
      kind: "file",
    });
    expect(await files.stats(worldPath("Outputs/clients.pptx"))).toMatchObject({ kind: "file" });
    // The files the Indexing view shows are in the world too.
    for (const path of ["Photos/IMG_2041.jpg", "Clients/projects/Dupont — quote.pdf"])
      expect(await files.stats(worldPath(path))).toMatchObject({ kind: "file" });
  });
});
