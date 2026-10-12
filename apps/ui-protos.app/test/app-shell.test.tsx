import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { FileText, List, ListChecks, ListTodo, Sparkles } from "lucide-react";
import { afterEach, describe, expect, it } from "vitest";
import {
  ApplyLayout,
  appViewsSlot,
  menuItem,
  menuItemsSlot,
  OpenSettings,
  ShowPanel,
  settingsTabsSlot,
} from "../src/app/contracts.js";
import {
  AppRuntimeContext,
  all,
  contributeAll,
  createRuntime,
  type Feature,
  provideAll,
  registerAll,
} from "../src/app/runtime.js";
import { AppShell } from "../src/app/shell/app-shell.js";
import type { Mode } from "../src/workspace-layout/responsive.js";

afterEach(cleanup);

const fixture: Feature = {
  id: "fixture",
  label: "Fixture",
  contribute: (rt) =>
    all(
      registerAll(rt.slots, appViewsSlot, [
        {
          id: "outline",
          title: "Outline",
          Icon: List,
          zone: "left",
          activity: 1,
          render: () => <p>Outline view</p>,
        },
        {
          id: "todos",
          title: "Todos",
          Icon: ListTodo,
          zone: "left",
          activity: 2,
          mobile: "tab",
          render: () => <p>Todos view</p>,
        },
        {
          id: "chat",
          title: "Chat",
          Icon: Sparkles,
          zone: "right",
          mobile: "tab",
          render: () => <p>Chat view</p>,
        },
        {
          id: "jobs",
          title: "Jobs",
          Icon: ListChecks,
          zone: "bottom",
          render: () => <p>Jobs view</p>,
        },
        {
          id: "report",
          title: "Report",
          Icon: FileText,
          zone: "center",
          mobile: "more",
          render: () => <p>Report view</p>,
        },
      ]),
      provideAll(rt.slots, menuItemsSlot, [
        menuItem(
          OpenSettings,
          {},
          { id: "settings", menu: "File", label: "Settings…", shortcut: "Ctrl+," },
        ),
        menuItem(
          OpenSettings,
          { section: "team" },
          { id: "team", menu: "File", label: "Team settings", shortcut: "Del" },
        ),
        menuItem(ShowPanel, { id: "report" }, { id: "report", menu: "View", label: "Report" }),
        menuItem(
          ApplyLayout,
          { id: "reading" },
          { id: "reading", menu: "View", submenu: "Layout", label: "Reading" },
        ),
      ]),
      registerAll(rt.slots, settingsTabsSlot, [
        {
          id: "me",
          label: "Me",
          group: "you",
          keywords: [],
          order: 1,
          render: () => <p>About me</p>,
        },
        {
          id: "team",
          label: "Team",
          group: "admin",
          keywords: [],
          order: 2,
          render: () => <p>The team</p>,
        },
      ]),
    ),
};

function renderShell(initialMode: Mode = "desktop") {
  const rt = createRuntime();
  contributeAll(rt, [fixture], { viewer: "admin", commander: { current: null } });
  render(
    <AppRuntimeContext.Provider value={rt}>
      <AppShell commanderRef={{ current: null }} initialMode={initialMode} />
    </AppRuntimeContext.Provider>,
  );
  return rt;
}

const tab = (title: string) =>
  screen.queryAllByText(title).find((el) => el.closest(".dv-tab")) as HTMLElement | undefined;
const groupOf = (el: HTMLElement | undefined) => el?.closest(".dv-groupview");
const activity = (name: string) =>
  within(screen.getByRole("navigation", { name: "Activity bar" })).getByRole("button", { name });
const closeTab = (title: string) => {
  const close = tab(title)?.closest(".dv-tab")?.querySelector(".dv-default-tab-action");
  fireEvent.pointerDown(close as Element);
  fireEvent.click(close as Element);
};
const settingsNav = () => screen.getByRole("navigation", { name: "Settings sections" });

describe("AppShell on a desktop", () => {
  it("lays the views out by zone: left views as tabs of one bar, then right, bottom; file panels in the center", () => {
    renderShell();
    expect(screen.getByText("Outline view")).toBeTruthy();
    expect(groupOf(tab("Outline"))).toBe(groupOf(tab("Todos")));
    expect(screen.getByText("Chat view")).toBeTruthy();
    expect(screen.getByText("Jobs view")).toBeTruthy();
    expect(groupOf(tab("clients"))).not.toBe(groupOf(tab("Outline")));
    expect(screen.queryByText("Report view")).toBeNull();
  });

  it("the activity bar switches the left view and collapses the bar", () => {
    renderShell();
    expect(activity("Outline").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(activity("Todos"));
    expect(activity("Todos").getAttribute("aria-pressed")).toBe("true");
    expect(activity("Outline").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("Todos view")).toBeTruthy();
    fireEvent.click(activity("Todos"));
    expect(activity("Todos").getAttribute("aria-pressed")).toBe("false");
  });

  it("the main menu runs the item's command", () => {
    renderShell();
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "View" }), { key: "Enter" });
    fireEvent.click(screen.getByRole("menuitem", { name: /^Report/ }));
    expect(screen.getByText("Report view")).toBeTruthy();
  });

  it("a center view opens beside the active file panel, and still opens when every file tab was closed", () => {
    const rt = renderShell();
    act(() => {
      rt.commands.call(ShowPanel, { id: "report" });
    });
    expect([groupOf(tab("clients")), groupOf(tab("2025"))]).toContain(groupOf(tab("Report")));
    closeTab("Report");
    closeTab("clients");
    closeTab("2025");
    act(() => {
      rt.commands.call(ShowPanel, { id: "report" });
    });
    expect(screen.getByText("Report view")).toBeTruthy();
    expect(groupOf(tab("Report"))).not.toBe(groupOf(tab("Outline")));
  });

  it("Ctrl+, opens Settings at the last section; a section that is not there opens the first", () => {
    const rt = renderShell();
    fireEvent.keyDown(document.body, { key: ",", ctrlKey: true });
    expect(screen.getByText("About me")).toBeTruthy();
    fireEvent.click(within(settingsNav()).getByRole("button", { name: "Team" }));
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(screen.queryByText("The team")).toBeNull();
    fireEvent.keyDown(document.body, { key: ",", ctrlKey: true });
    expect(screen.getByText("The team")).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    act(() => {
      rt.commands.call(OpenSettings, { section: "nowhere" });
    });
    expect(screen.getByText("About me")).toBeTruthy();
  });

  it("a shortcut typed into a text field stays in the field", () => {
    renderShell();
    const filter = screen.getAllByPlaceholderText("Filter by name")[0] as HTMLElement;
    fireEvent.keyDown(filter, { key: "Delete" });
    expect(screen.queryByRole("navigation", { name: "Settings sections" })).toBeNull();
    fireEvent.keyDown(document.body, { key: "Delete" });
    expect(screen.getByText("The team")).toBeTruthy();
  });
});

describe("AppShell on a tablet", () => {
  it("compact: side views open as overlays from the activity bar; Escape and the backdrop close them", () => {
    renderShell("compact");
    expect(screen.queryByText("Outline view")).toBeNull();
    expect(screen.getByText("Jobs view")).toBeTruthy();
    fireEvent.click(activity("Chat"));
    expect(
      within(screen.getByRole("complementary", { name: "Chat" })).getByText("Chat view"),
    ).toBeTruthy();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("complementary", { name: "Chat" })).toBeNull();
    fireEvent.click(activity("Outline"));
    fireEvent.click(screen.getByRole("button", { name: "Close panel" }));
    expect(screen.queryByRole("complementary", { name: "Outline" })).toBeNull();
  });
});

describe("AppShell on a phone", () => {
  it("one view at a time; More lists the rest; ☰ runs the same items", () => {
    renderShell("mobile");
    const views = screen.getByRole("navigation", { name: "Views" });
    expect(
      within(views)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Files", "Todos", "Chat", "More"]);
    fireEvent.click(within(views).getByRole("button", { name: "Todos" }));
    expect(screen.getByText("Todos view")).toBeTruthy();
    fireEvent.click(within(views).getByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    expect(screen.getByText("Report view")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    fireEvent.click(screen.getByRole("button", { name: "File" }));
    fireEvent.click(screen.getByRole("button", { name: /^Settings…/ }));
    // A phone's Settings opens at the section list; each section is a page.
    fireEvent.click(within(settingsNav()).getByRole("button", { name: "Me" }));
    expect(screen.getByText("About me")).toBeTruthy();
  });

  it("phone: a file opens full screen and Back returns to its panel", async () => {
    renderShell("mobile");
    fireEvent.click(screen.getByRole("tab", { name: "2025" }));
    fireEvent.doubleClick(await screen.findByRole("row", { name: /backup\.zip/ }));
    expect(await screen.findByRole("region", { name: "Viewer: backup.zip" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("row", { name: /backup\.zip/ })).toBeTruthy();
  });
});
