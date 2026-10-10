import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { BrowserData } from "../src/browser-data/browser-data.js";
import {
  chatFileName,
  exportFileNames,
  formatBytes,
  GB,
  KB,
  MB,
  mockParts,
  olderThan,
  summarize,
  zipName,
} from "../src/browser-data/storage.js";
import { mockChats } from "../src/conversations/chat-index.js";
import { today } from "../src/mock.js";

afterEach(cleanup);

it("totals the storage and splits what is lost from what comes back", () => {
  const s = summarize(mockParts, 4 * GB);
  expect(formatBytes(s.used)).toBe("352 MB");
  expect(s.bytes.rebuilt).toBe(340 * MB);
  expect(s.bytes.lost).toBe(12 * MB + 48 * KB + 220 * KB);
  expect(s.parts.lost.map((p) => p.kind)).toEqual(["chats", "settings", "drafts"]);
  expect(s.parts.relink.map((p) => p.kind)).toEqual(["identity"]);
  expect(summarize(mockParts, 100 * MB).fraction).toBe(1);
});

it("formats sizes the way the page shows them", () => {
  expect(formatBytes(48 * KB)).toBe("48 KB");
  expect(formatBytes(1.5 * GB)).toBe("1.5 GB");
  expect(formatBytes(4 * GB)).toBe("4 GB");
});

it("names exported chats by date and title, safe for any file system, never twice the same", () => {
  const at = new Date("2026-10-08T09:00:00Z");
  expect(chatFileName({ title: 'Q3: "final" figures?', createdAt: at })).toBe(
    "2026-10-08 Q3 final figures.md",
  );
  expect(chatFileName({ title: "///", createdAt: at })).toBe("2026-10-08 Chat.md");
  expect(
    exportFileNames([
      { title: "Dupont", createdAt: at },
      { title: "Dupont", createdAt: at },
      { title: "Dupont", createdAt: at },
    ]),
  ).toEqual(["2026-10-08 Dupont.md", "2026-10-08 Dupont (2).md", "2026-10-08 Dupont (3).md"]);
  expect(zipName(today)).toBe("sandclaw-chats-2026-10-10.zip");
});

it("finds the chats older than a period by their last activity", () => {
  const chats = mockChats.map((c) => c.entry);
  expect(olderThan(chats, 7, today).map((c) => c.id)).toEqual([
    "c_leroy_brief",
    "c_kitchen",
    "c_hello",
  ]);
});

it("asks the browser to protect the data, and says when it is granted", async () => {
  render(<BrowserData persist="not-asked" browserAnswers />);
  fireEvent.click(screen.getByRole("button", { name: "Protect from automatic clearing" }));
  expect(await screen.findByText(/^Protected:/)).toBeTruthy();
});

it("deleting old chats asks first", async () => {
  render(<BrowserData />);
  expect(screen.getByText("Chats (9)")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Delete 3 chats…" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(screen.getByText("Chats (9)")).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "Delete 3 chats" }));
  expect(screen.getByText("Chats (6)")).toBeTruthy();
});
