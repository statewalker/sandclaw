import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { today } from "../src/mock.js";
import {
  type Draft,
  healthOf,
  type Service,
  services,
  validateDraft,
} from "../src/services/endpoints.js";
import { Services } from "../src/services/services.js";

afterEach(cleanup);

describe("validateDraft", () => {
  const ok: Draft = {
    name: "Scanner",
    path: "/scanner",
    target: "http://192.168.1.32:8080",
    access: "everyone",
  };

  it("accepts a complete draft", () => {
    expect(validateDraft(ok, services)).toEqual({});
  });

  it("names each mistake", () => {
    const errors = validateDraft(
      { ...ok, name: " ", path: "scanner", target: "192.168.1.32" },
      services,
    );
    expect(Object.keys(errors).sort()).toEqual(["name", "path", "target"]);
    expect(validateDraft({ ...ok, path: "/" }, services).path).toMatch(/Sandclaw itself/);
    expect(validateDraft({ ...ok, path: "/my scanner" }, services).path).toBeTruthy();
    expect(validateDraft({ ...ok, target: "ftp://192.168.1.32" }, services).target).toBeTruthy();
  });

  it("refuses an address another service uses, ignoring case and a trailing /", () => {
    expect(validateDraft({ ...ok, path: "/Paperless/" }, services).path).toBe(
      "Already used by Documents archive.",
    );
    // A service keeps its own address when edited.
    expect(validateDraft({ ...ok, path: "/paperless" }, services, "paperless")).toEqual({});
  });
});

describe("healthOf", () => {
  const base: Service = services[0] as Service;
  const at = today;

  it("reads the last test: no answer is down, over a second is slow", () => {
    expect(healthOf({ ...base, probe: { at, ms: 200 } }, false)).toBe("ok");
    expect(healthOf({ ...base, probe: { at, ms: 1500 } }, false)).toBe("slow");
    expect(healthOf({ ...base, probe: { at, error: "Connection refused" } }, false)).toBe("down");
    expect(healthOf({ ...base, probe: undefined }, false)).toBe("checking");
  });

  it("off wins over everything, then a running test", () => {
    const down = { ...base, probe: { at, error: "x" } };
    expect(healthOf({ ...down, enabled: false }, true)).toBe("disabled");
    expect(healthOf(down, true)).toBe("checking");
  });
});

describe("Services", () => {
  it("adding with mistakes shows them and adds nothing", () => {
    render(<Services />);
    fireEvent.click(screen.getByRole("button", { name: "Add a service" }));
    fireEvent.change(screen.getByLabelText("Address in Sandclaw"), { target: { value: "scan" } });
    fireEvent.click(screen.getByRole("button", { name: "Add and test" }));
    expect(screen.getByText(/Give it a name/)).toBeTruthy();
    expect(screen.getByText("Start with /, like /paperless.")).toBeTruthy();
    expect(screen.getByText(/starting with http:\/\//)).toBeTruthy();
    expect(screen.getAllByRole("button", { expanded: false })).toHaveLength(services.length);
  });

  it("a valid service is added and tested", async () => {
    render(<Services test={async () => ({ at: today, error: "Connection refused" })} />);
    fireEvent.click(screen.getByRole("button", { name: "Add a service" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Scanner" } });
    fireEvent.change(screen.getByLabelText("Address in Sandclaw"), {
      target: { value: "/scanner" },
    });
    fireEvent.change(screen.getByLabelText("Where it runs"), {
      target: { value: "http://10.0.0.9" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add and test" }));
    expect(await screen.findByText(/No answer: Connection refused/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Scanner/, expanded: true })).toBeTruthy();
  });

  it("turning a service off shows it off, and on again", () => {
    render(<Services variant="list-detail" selected="paperless" />);
    const detail = screen.getByRole("region", { name: "Service details" });
    fireEvent.click(within(detail).getByRole("button", { name: "Turn off" }));
    expect(within(detail).getByText("Off")).toBeTruthy();
    expect(within(detail).getByText("Turned off")).toBeTruthy();
    fireEvent.click(within(detail).getByRole("button", { name: "Turn on" }));
    expect(within(detail).getByText("Testing…")).toBeTruthy();
  });

  it("a built-in service cannot be removed; an added one can, after confirming", () => {
    render(<Services variant="list-detail" selected="llm-api" />);
    const detail = screen.getByRole("region", { name: "Service details" });
    expect(within(detail).queryByRole("button", { name: "Remove" })).toBeNull();
    expect(within(detail).getByText(/can be turned off, not removed/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Printer status/ }));
    fireEvent.click(within(detail).getByRole("button", { name: "Remove" }));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("Remove Printer status?")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    expect(screen.queryByText("Printer status")).toBeNull();
  });
});
