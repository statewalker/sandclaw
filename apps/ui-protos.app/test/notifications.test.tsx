import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { today } from "../src/mock.js";
import {
  channelOf,
  groupRepeats,
  KEEP_MAX,
  type Notice,
  type NoticeKind,
  placesFor,
  setChannel,
  trim,
  unreadCount,
} from "../src/notifications/inbox.js";
import { arriving, history } from "../src/notifications/notices-mock.js";
import { NotificationSettings } from "../src/notifications/notification-settings.js";
import { Notifications } from "../src/notifications/notifications.js";

afterEach(cleanup);

const minutesAgo = (min: number) => new Date(today.getTime() - min * 60_000);
const n = (id: string, kind: NoticeKind, min: number, read = false): Notice => ({
  id,
  kind,
  at: minutesAgo(min),
  title: id,
  read,
});

describe("inbox", () => {
  it("merges repeats of a kind within an hour, never security ones", () => {
    const groups = groupRepeats([
      n("a", "task-finished", 0),
      n("b", "task-finished", 20),
      n("x", "site-built", 30),
      n("c", "task-finished", 50),
      n("d", "task-finished", 90),
      n("e", "device-added", 100),
      n("f", "device-added", 101),
    ]);
    expect(groups.map((g) => g.title)).toEqual(["3 tasks finished", "x", "d", "e", "f"]);
  });

  it("counts unread lines that arrived since the bell was opened", () => {
    const items = [
      n("a", "task-finished", 0),
      n("b", "task-finished", 5),
      n("c", "site-built", 30),
      n("d", "task-failed", 40, true),
    ];
    expect(unreadCount(items)).toBe(2);
    expect(unreadCount(items, minutesAgo(10))).toBe(1);
  });

  it("keeps the last 30 days, at most the 100 newest", () => {
    const old = n("old", "site-built", 31 * 24 * 60);
    const many = Array.from({ length: 120 }, (_, i) => n(`n${i}`, "task-finished", i));
    const kept = trim([old, ...many], today);
    expect(kept).toHaveLength(KEEP_MAX);
    expect(kept.at(-1)?.id).toBe("n99");
  });

  it("security kinds cannot be turned off", () => {
    const settings = setChannel({}, "device-added", "off");
    expect(channelOf("device-added", settings)).toBe("bell-toast");
    expect(channelOf("device-added", { "device-added": "off" })).toBe("bell-toast");
  });

  it("routes a kind by its setting, to the OS when the tab is in the background", () => {
    expect(placesFor("task-finished", {})).toEqual(["bell", "toast"]);
    expect(placesFor("indexing-done", {})).toEqual(["bell"]);
    expect(placesFor("task-finished", { "task-finished": "off" })).toEqual([]);
    expect(placesFor("task-finished", {}, { background: true, osAllowed: true })).toEqual([
      "bell",
      "os",
    ]);
    expect(placesFor("task-finished", {}, { background: true, osAllowed: false })).toEqual([
      "bell",
      "toast",
    ]);
  });
});

describe("Notifications", () => {
  it("opening the bell clears the badge; mark all read clears the unread marks", () => {
    render(<Notifications notices={history} arriving={arriving} />);
    const bell = screen.getByRole("button", { name: /^Notifications, \d+ new$/ });
    fireEvent.click(bell);
    expect(bell.getAttribute("aria-label")).toBe("Notifications");
    const panel = screen.getByRole("dialog", { name: "Notifications" });
    expect(within(panel).getAllByText("unread").length).toBeGreaterThan(0);
    fireEvent.click(within(panel).getByRole("button", { name: "Mark all read" }));
    expect(within(panel).queryByText("unread")).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a toast's action opens the notice and removes the toast", () => {
    render(<Notifications notices={history} arriving={arriving} />);
    const toasts = screen.getByRole("list", { name: "New notifications" });
    expect(within(toasts).getByText("3 tasks finished")).toBeTruthy();
    fireEvent.click(within(toasts).getByRole("button", { name: "Review" }));
    expect(screen.getByRole("status").textContent).toMatch(/Review: Firefox on Mac was added/);
    expect(within(toasts).queryByText(/Firefox on Mac/)).toBeNull();
  });

  it("changing a kind's setting; the security one is locked", () => {
    render(<NotificationSettings />);
    const finished = screen.getByRole("group", { name: "A task finished" });
    const off = within(finished).getByLabelText("Off") as HTMLInputElement;
    fireEvent.click(off);
    expect(off.checked).toBe(true);
    const device = screen.getByRole("group", { name: "A device was added to my identity" });
    expect(within(device).getByLabelText("Off").matches(":disabled")).toBe(true);
  });
});
