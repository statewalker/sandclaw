import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App, allFeatures } from "../src/app/app.js";
import { appViewsSlot, menuItemsSlot, settingsTabsSlot } from "../src/app/contracts.js";
import { createRuntime } from "../src/app/runtime.js";

afterEach(cleanup);

function renderApp(props: Parameters<typeof App>[0] = {}) {
  const runtime = createRuntime();
  render(<App runtime={runtime} {...props} />);
  return runtime;
}
const labels = (rt: ReturnType<typeof createRuntime>) =>
  rt.slots.getSnapshot(menuItemsSlot).map((i) => i.label);

describe("App", () => {
  it("every menu item names a command some handler answers", () => {
    const rt = renderApp();
    const handled = new Set(rt.handled.list().map((d) => d.key));
    const unanswered = rt.slots
      .getSnapshot(menuItemsSlot)
      .filter((i) => !handled.has(i.command))
      .map((i) => `${i.menu} › ${i.label} (${i.command})`);
    expect(unanswered).toEqual([]);
  });

  it("Claire's menus and Settings include the admin items; Hugo's don't", () => {
    const admin = renderApp();
    expect(labels(admin)).toContain("AI models…");
    expect([...admin.slots.getSnapshot(settingsTabsSlot).keys()]).toContain("team");
    cleanup();
    const member = renderApp({ viewer: "member" });
    expect(labels(member)).not.toContain("AI models…");
    expect(labels(member)).not.toContain("Invitations log");
    const memberTabs = [...member.slots.getSnapshot(settingsTabsSlot).values()];
    expect(memberTabs.length).toBeGreaterThan(0);
    expect(memberTabs.filter((t) => t.group !== "you")).toEqual([]);
    expect([...member.slots.getSnapshot(appViewsSlot).keys()]).not.toContain("invitations-log");
  });

  it("a feature switched off leaves no view, menu item or settings section behind", () => {
    const rt = renderApp({
      features: allFeatures.map((f) => f.id).filter((id) => id !== "sites" && id !== "indexing"),
    });
    expect(rt.slots.getSnapshot(appViewsSlot).has("sites")).toBe(false);
    expect(labels(rt)).not.toContain("Sites");
    expect(labels(rt)).not.toContain("Find in files…");
    expect([...rt.slots.getSnapshot(settingsTabsSlot).keys()]).not.toContain("indexing");
    const bar = screen.getByRole("navigation", { name: "Activity bar" });
    expect(within(bar).queryByRole("button", { name: "Sites" })).toBeNull();
  });

  it("on a desktop the real views sit in their zones, with the bell and Claire's avatar on top", () => {
    renderApp();
    expect(screen.getByRole("treegrid", { name: "Contents of /documents" })).toBeTruthy();
    expect(screen.getByPlaceholderText("Ask about your folder…")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Notifications/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Claire Morel" })).toBeTruthy();
  });

  it("Edit › Rename acts on the active file panel's selection", async () => {
    renderApp();
    // A press in a panel makes it the active one; the click selects the row.
    const row = await screen.findByRole("row", { name: /2026-Q3\.xlsx/ });
    fireEvent.mouseDown(row);
    fireEvent.click(row);
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "Edit" }), { key: "Enter" });
    fireEvent.click(screen.getByRole("menuitem", { name: /^Rename/ }));
    expect(await screen.findByRole("dialog", { name: "Rename 2026-Q3.xlsx" })).toBeTruthy();
  });

  it("the Files tree shows the Atelier Morel folder", async () => {
    renderApp();
    const tree = screen.getByRole("treegrid", { name: "Contents of /documents" });
    for (const name of ["Clients", "Finance", "Notes", "Outputs"]) {
      expect(await within(tree).findByRole("row", { name: new RegExp(name) })).toBeTruthy();
    }
  });

  it("File › Lock covers the App until the password is typed", () => {
    renderApp();
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "File" }), { key: "Enter" });
    fireEvent.click(screen.getByRole("menuitem", { name: /^Lock/ }));
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    expect(screen.queryByLabelText("Password")).toBeNull();
  });

  it("with Settings open, a menu shortcut does not reach the panel behind it", async () => {
    renderApp();
    const row = await screen.findByRole("row", { name: /2026-Q3\.xlsx/ });
    fireEvent.mouseDown(row);
    fireEvent.click(row);
    fireEvent.keyDown(document.body, { key: ",", ctrlKey: true });
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
    fireEvent.keyDown(document.body, { key: "Delete" });
    expect(screen.queryByRole("dialog", { name: /^Delete/ })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
  });

  it("behind the lock, Ctrl+, does not open Settings", () => {
    renderApp();
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "File" }), { key: "Enter" });
    fireEvent.click(screen.getByRole("menuitem", { name: /^Lock/ }));
    fireEvent.keyDown(document.body, { key: ",", ctrlKey: true });
    expect(screen.queryByRole("navigation", { name: "Settings sections" })).toBeNull();
    expect(screen.getByLabelText("Password")).toBeTruthy();
  });

  it("choosing Dark in Settings › Appearance darkens the App at once", () => {
    renderApp();
    fireEvent.keyDown(document.body, { key: ",", ctrlKey: true });
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Settings sections" })).getByRole("button", {
        name: "Appearance",
      }),
    );
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    cleanup();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
