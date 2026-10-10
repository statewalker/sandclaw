import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Settings } from "../src/settings/settings.js";
import { resolveSection, searchSections, visibleSections } from "../src/settings/settings-model.js";

afterEach(cleanup);

describe("sections", () => {
  it("a member sees only the “You” sections; an admin sees the group's too", () => {
    expect(visibleSections("member").every((s) => s.group === "you")).toBe(true);
    expect(visibleSections("admin").map((s) => s.id)).toEqual(
      expect.arrayContaining(["team", "invitations", "services", "ai-models"]),
    );
  });

  it("search matches labels and keywords, accents and case ignored", () => {
    const ids = (q: string) => searchSections(visibleSections("admin"), q).map((h) => h.section.id);
    expect(ids("APPEAR")).toEqual(["appearance"]);
    expect(searchSections(visibleSections("admin"), "lock")).toEqual([
      expect.objectContaining({ keyword: "lock", section: expect.objectContaining({ id: "me" }) }),
    ]);
    expect(ids("tökén")).toEqual(["ai-models"]);
    expect(searchSections(visibleSections("member"), "token")).toEqual([]);
  });

  it("an unknown or forbidden deep link falls back to the first section", () => {
    expect(resolveSection("admin", "team")).toBe("team");
    expect(resolveSection("member", "team")).toBe("me");
    expect(resolveSection("admin", "nowhere")).toBe("me");
  });
});

describe("Settings", () => {
  it("a member sees no admin group", () => {
    render(<Settings viewer="member" />);
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    expect(within(nav).queryByText("Your group — admin")).toBeNull();
    expect(within(nav).queryByRole("button", { name: "Team" })).toBeNull();
  });

  it("choosing a section shows it", () => {
    render(<Settings />);
    expect(screen.queryByRole("radio", { name: "Dark" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Appearance" }));
    expect(screen.getByRole("radio", { name: "Dark" })).toBeTruthy();
  });

  it("on a phone, Back returns to the section list", () => {
    render(<Settings phone section="appearance" />);
    expect(screen.queryByRole("navigation")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("navigation", { name: "Settings sections" })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "Dark" })).toBeNull();
  });
});
