import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/app/app.js";
import { OpenFile, OpenSettings, RevealFile, ShowPanel } from "../src/app/contracts.js";
import { createRuntime } from "../src/app/runtime.js";

afterEach(cleanup);

function renderApp(props: Parameters<typeof App>[0] = {}) {
  const runtime = createRuntime();
  render(<App runtime={runtime} {...props} />);
  return runtime;
}
const tab = (title: string) =>
  screen.queryAllByText(title).filter((el) => el.closest(".dv-tab")) as HTMLElement[];
const groupOf = (el: HTMLElement | undefined) => el?.closest(".dv-groupview");

describe("files:open and files:reveal", () => {
  it("opens a file as a tab beside the active file panel, its cited passage marked", async () => {
    const rt = renderApp();
    await screen.findByRole("row", { name: /2026-Q3\.xlsx/ });
    act(() => {
      rt.commands.call(OpenFile, {
        path: "Clients/Dupont — offer.docx",
        citation: { question: "What did we offer Dupont?", blockId: "o3" },
      });
    });
    expect(await screen.findByText(/Cited in/)).toBeTruthy();
    const [offer] = tab("Dupont — offer.docx");
    expect([groupOf(tab("Clients")[0]), groupOf(tab("Finance")[0])]).toContain(groupOf(offer));
  });

  it("re-opening an open document with another citation marks the new passage", async () => {
    const rt = renderApp();
    const open = (question: string, blockId: string) =>
      act(() => {
        rt.commands.call(OpenFile, {
          path: "Clients/Dupont — offer.docx",
          citation: { question, blockId },
        });
      });
    open("When does phase 1 end?", "o3");
    expect(await screen.findByText(/When does phase 1 end\?/)).toBeTruthy();
    open("What does it cost?", "o5");
    expect(await screen.findByText(/What does it cost\?/)).toBeTruthy();
    expect(screen.queryByText(/When does phase 1 end\?/)).toBeNull();
    const marked = document.querySelectorAll("[data-cited]");
    expect(marked).toHaveLength(1);
    expect(marked[0]?.textContent).toMatch(/€18,400/);
    expect(tab("Dupont — offer.docx")).toHaveLength(1);
  });

  it("opening an open file brings its tab forward", async () => {
    const rt = renderApp();
    for (let i = 0; i < 2; i++) {
      act(() => {
        rt.commands.call(OpenFile, { path: "Notes/todo.md" });
      });
      await screen.findAllByText("todo.md");
    }
    expect(tab("todo.md")).toHaveLength(1);
  });

  it("a file that is not in the folder says so", async () => {
    const rt = renderApp();
    act(() => {
      rt.commands.call(OpenFile, { path: "Clients/Nobody — nothing.pdf" });
    });
    expect(await screen.findByText("“Nobody — nothing.pdf” is not in the folder.")).toBeTruthy();
    expect(tab("Nobody — nothing.pdf")).toHaveLength(0);
  });

  it("reveal shows the folder in a docked panel with the file selected", async () => {
    const rt = renderApp();
    // The Files tree (not docked) is the active panel after a click in it.
    const tree = screen.getByRole("treegrid", { name: "Contents of /documents" });
    fireEvent.mouseDown(tree);
    act(() => {
      rt.commands.call(RevealFile, { path: "Notes/meeting 2026-10-02.md" });
    });
    const row = await screen.findByRole("row", { name: /meeting 2026-10-02\.md/ });
    expect(row.getAttribute("aria-selected")).toBe("true");
    expect(within(tree).queryByRole("row", { name: /meeting 2026-10-02\.md/ })).toBeNull();
  });

  it("on a phone, revealing a file switches to Files and shows it selected", async () => {
    const rt = renderApp({ initialMode: "mobile" });
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Views" })).getByRole("button", {
        name: "Todos",
      }),
    );
    act(() => {
      rt.commands.call(RevealFile, { path: "Notes/meeting 2026-10-02.md" });
    });
    const row = await screen.findByRole("row", { name: /meeting 2026-10-02\.md/ });
    expect(row.getAttribute("aria-selected")).toBe("true");
  });

  it("revealing a file that is not in the folder says so and leaves the panel alone", async () => {
    const rt = renderApp();
    await screen.findByRole("row", { name: /2026-Q3\.xlsx/ });
    act(() => {
      rt.commands.call(RevealFile, { path: "Clients/Nobody — nothing.pdf" });
    });
    expect(await screen.findByText("“Nobody — nothing.pdf” is not in the folder.")).toBeTruthy();
    expect(tab("Clients")).toHaveLength(1);
    expect(tab("Finance")).toHaveLength(1);
    expect(screen.getByRole("row", { name: /2026-Q3\.xlsx/ })).toBeTruthy();
  });

  it("on a phone, revealing a file while a viewer is open shows the file in Files", async () => {
    const rt = renderApp({ initialMode: "mobile" });
    act(() => {
      rt.commands.call(OpenFile, { path: "Notes/todo.md" });
    });
    expect(await screen.findByRole("region", { name: "Viewer: todo.md" })).toBeTruthy();
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Views" })).getByRole("button", {
        name: "Todos",
      }),
    );
    act(() => {
      rt.commands.call(RevealFile, { path: "Finance/2026-Q3.xlsx" });
    });
    const row = await screen.findByRole("row", { name: /2026-Q3\.xlsx/ });
    expect(row.getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByRole("region", { name: "Viewer: todo.md" })).toBeNull();
  });

  it("on a phone, opening a file switches to Files and shows it full screen", async () => {
    const rt = renderApp({ initialMode: "mobile" });
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Views" })).getByRole("button", {
        name: "Todos",
      }),
    );
    act(() => {
      rt.commands.call(OpenFile, { path: "Notes/todo.md" });
    });
    expect(await screen.findByRole("region", { name: "Viewer: todo.md" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.queryByRole("region", { name: "Viewer: todo.md" })).toBeNull();
  });
});

describe("links from the views", () => {
  const activity = (name: string) =>
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Activity bar" })).getByRole("button", {
        name,
      }),
    );

  it("a todo's file opens beside the active file panel", async () => {
    renderApp();
    activity("Todos");
    fireEvent.click(await screen.findByRole("button", { name: "Open Notes/todo.md" }));
    expect(await screen.findAllByText("todo.md")).not.toHaveLength(0);
    expect(tab("todo.md")).toHaveLength(1);
  });

  it("an assistant's output opens", async () => {
    // The deck scenario writes its output after a few scripted steps; fake timers play them.
    vi.useFakeTimers();
    try {
      renderApp();
      // Step by step: each step's timer is set after the previous step renders.
      for (let i = 0; i < 40 && !screen.queryByRole("button", { name: /Outputs\/clients/ }); i++) {
        await act(() => vi.advanceTimersByTimeAsync(600));
      }
      fireEvent.click(screen.getByRole("button", { name: /Outputs\/clients\.pptx/ }));
    } finally {
      vi.useRealTimers();
    }
    await screen.findAllByText("clients.pptx");
    expect(tab("clients.pptx")).toHaveLength(1);
  });

  it("Open file on a cited source opens it with the passage marked", async () => {
    const rt = renderApp();
    act(() => {
      rt.commands.call(ShowPanel, { id: "how-answered" });
    });
    // Any source card of the answer opens its preview, which has "Open file".
    fireEvent.click(
      (await screen.findAllByRole("button", { name: /Dupont — offer\.docx/ }))[0] as HTMLElement,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Open file" }));
    expect(await screen.findByText(/Cited in/)).toBeTruthy();
  });

  it("a file in the indexing tree shows in the active file panel", async () => {
    renderApp();
    activity("Indexing");
    // Clients is unfolded from the start; click a file in it.
    fireEvent.click(await screen.findByRole("button", { name: /^Leroy — brief\.pdf/ }));
    expect(
      (await screen.findAllByRole("row", { name: /Leroy — brief\.pdf/ })).some(
        (r) => r.getAttribute("aria-selected") === "true",
      ),
    ).toBe(true);
  });

  it("a cited file in a site opens", async () => {
    renderApp();
    activity("Sites");
    // Open the site so SiteViewer is mounted; its page posts this message when a source link is clicked.
    const site = await screen.findByRole("listitem", { name: "Dupont renovation" });
    fireEvent.click(within(site).getByRole("button", { name: "Open" }));
    const frame = (await screen.findAllByTitle("Dupont renovation")).find(
      (el) => el.tagName === "IFRAME",
    ) as HTMLIFrameElement;
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "sandclaw:open-file", path: "Clients/Dupont — notes.md" },
          source: frame.contentWindow,
        }),
      );
    });
    await waitFor(() => expect(tab("Dupont — notes.md")).toHaveLength(1));
  });
});

describe("navigation links", () => {
  const bell = () => screen.getByRole("button", { name: /^Notifications/ });

  it("a notice about a file opens it", async () => {
    renderApp();
    fireEvent.click(bell());
    fireEvent.click(await screen.findByRole("button", { name: /Update the Dupont offer/ }));
    await waitFor(() => expect(tab("Dupont — offer.docx")).toHaveLength(1));
  });

  it("a notice about unreadable files opens Settings › What the assistant reads", async () => {
    renderApp();
    fireEvent.click(bell());
    fireEvent.click(await screen.findByRole("button", { name: /couldn't be read/ }));
    const nav = await screen.findByRole("navigation", { name: "Settings sections" });
    expect(
      within(nav)
        .getByRole("button", { name: "What the assistant reads" })
        .getAttribute("aria-current"),
    ).toBe("page");
  });

  it("a notice that targets an admin section opens the first one for a member", async () => {
    const rt = renderApp({ viewer: "member" });
    act(() => {
      rt.commands.call(OpenSettings, { section: "services" });
    });
    const nav = await screen.findByRole("navigation", { name: "Settings sections" });
    expect(within(nav).getByRole("button", { name: "Me" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("the group pill shows the Team view", async () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: /Atelier Morel/ }));
    const bar = screen.getByRole("navigation", { name: "Activity bar" });
    await waitFor(() =>
      expect(within(bar).getByRole("button", { name: "Team" }).getAttribute("aria-pressed")).toBe(
        "true",
      ),
    );
  });

  it("Manage team… opens Settings › Team for an admin; a member has no such button", async () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: /Atelier Morel/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Manage team…" }));
    const nav = await screen.findByRole("navigation", { name: "Settings sections" });
    expect(within(nav).getByRole("button", { name: "Team" }).getAttribute("aria-current")).toBe(
      "page",
    );
    cleanup();
    renderApp({ viewer: "member" });
    fireEvent.click(screen.getByRole("button", { name: /Atelier Morel/ }));
    await screen.findAllByText("Team");
    expect(screen.queryByRole("button", { name: "Manage team…" })).toBeNull();
  });

  it("Edit table of contents opens the table-of-contents editor", async () => {
    renderApp();
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Activity bar" })).getByRole("button", {
        name: "Sites",
      }),
    );
    const site = await screen.findByRole("listitem", { name: "Dupont renovation" });
    fireEvent.click(within(site).getByRole("button", { name: /table of contents/i }));
    await waitFor(() => expect(tab("Table of contents")).toHaveLength(1));
  });
});
