import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { frames } from "../gallery/scenarios.js";
import { HELP_URL, HelpTip } from "../src/kit/help-tip.js";

afterEach(cleanup);

describe("HelpTip", () => {
  it("is a small ? pill that opens how this part is kept safe, with a link to the help", async () => {
    render(
      <HelpTip title="Invites" help="security#invites">
        <p>This link lets one person join, once.</p>
      </HelpTip>,
    );
    const pill = screen.getByRole("button", { name: "How this is kept safe: Invites" });
    expect(pill.textContent).toBe("?");
    await act(async () => {
      fireEvent.click(pill);
    });
    expect(screen.getByText("This link lets one person join, once.")).toBeTruthy();
    const more = screen.getByRole("link", { name: /Learn more/ });
    expect(more.getAttribute("href")).toBe(`${HELP_URL}security#invites`);
    expect(more.getAttribute("target")).toBe("_blank");
  });
});

/** The screens a person decides on, and the tips each must carry. */
const expected: Record<string, string[]> = {
  "s3-health": [
    "Shared from this tab",
    "Who can see your services",
    "Where your pages go",
    "The local proxy",
  ],
  "s1-prompt": ["The local proxy", "Local or remote"],
  "g1-landing": ["Encrypted end to end"],
  "g3-viewer": ["A private, isolated page"],
};

describe("help tips on the critical screens", () => {
  it.each(Object.entries(expected))("%s explains its safety", (id, titles) => {
    const frame = frames.find((f) => f.id === id);
    render(<div>{frame?.render()}</div>);
    for (const title of titles) {
      expect(screen.getByRole("button", { name: `How this is kept safe: ${title}` })).toBeTruthy();
    }
  });
});
