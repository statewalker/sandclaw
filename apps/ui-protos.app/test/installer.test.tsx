import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  checksPass,
  defaultChoice,
  downloadPlan,
  downloadSeconds,
  evaluateChecks,
  formatDuration,
  macMini,
  resumeStep,
  validateNames,
} from "../src/installer/install-steps.js";
import { Installer } from "../src/installer/installer.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const status = (facts: Partial<typeof macMini>, needGB = 30) =>
  Object.fromEntries(evaluateChecks({ ...macMini, ...facts }, needGB).map((c) => [c.id, c.status]));

it("evaluates the machine: Docker and too little disk or memory block, the rest only warns", () => {
  expect(status({})).toEqual({ docker: "pass", disk: "pass", memory: "pass", gpu: "pass" });
  expect(status({ dockerInstalled: false }).docker).toBe("fail");
  expect(status({ dockerRunning: false }).docker).toBe("fail");
  expect(status({ freeDiskGB: 25 }).disk).toBe("fail");
  expect(status({ freeDiskGB: 45 }).disk).toBe("warn");
  expect(status({ memoryGB: 4 }).memory).toBe("fail");
  expect(status({ memoryGB: 8 }).memory).toBe("warn");
  expect(status({ appleSilicon: false, chip: "Intel Core i5" }).gpu).toBe("warn");

  expect(checksPass(evaluateChecks({ ...macMini, memoryGB: 8, appleSilicon: false }, 30))).toBe(
    true,
  );
  expect(checksPass(evaluateChecks({ ...macMini, dockerRunning: false }, 30))).toBe(false);
});

it("reopens at the first step not done", () => {
  expect(resumeStep([])).toBe("check");
  expect(resumeStep(["check", "models", "names"])).toBe("download");
  expect(resumeStep(["models", "check"])).toBe("names");
  expect(resumeStep(["check", "models", "names", "download", "start", "invite"])).toBe("invite");
});

it("totals the download, counting a model picked twice once, and estimates the time", () => {
  const plan = downloadPlan(defaultChoice);
  expect(plan.items.map((i) => i.id)).toEqual([
    "sandclaw",
    "llama-3.1-8b",
    "llama-3.2-3b",
    "nomic-embed",
  ]);
  expect(plan.totalGB).toBe(8.9);
  expect(downloadPlan({ ...defaultChoice, summary: "llama-3.1-8b" }).totalGB).toBe(6.9);

  expect(downloadSeconds(1, 80)).toBe(100);
  expect(formatDuration(downloadSeconds(0.3, 100))).toBe("under a minute");
  expect(formatDuration(downloadSeconds(8.9, 50))).toBe("about 24 min");
  expect(formatDuration(downloadSeconds(30, 50))).toBe("about 1 h 20 min");
});

it("asks for both names, trimmed and not too long", () => {
  expect(validateNames({ group: "Atelier Morel", admin: "Claire" })).toEqual({});
  const errors = validateNames({ group: "   ", admin: "x".repeat(41) });
  expect(errors.group).toMatch(/Give the group a name/);
  expect(errors.admin).toMatch(/under 40/);
});

it("walks forward through the questions, and refuses to start without names", () => {
  render(<Installer />);
  expect(screen.getByRole("heading", { name: "Check this Mac" })).toBeTruthy();
  click("Next");
  expect(screen.getByRole("heading", { name: "Choose the AI models" })).toBeTruthy();
  click("Next");
  click("Download and set up");
  expect(screen.getByText(/Give the group a name/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("The group's name"), {
    target: { value: "Atelier Morel" },
  });
  fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Claire Morel" } });
  click("Download and set up");
  expect(screen.getByRole("heading", { name: "Download" })).toBeTruthy();
});

it("blocks on a missing prerequisite until a check finds it fixed", () => {
  render(<Installer facts={{ ...macMini, dockerInstalled: false }} factsAfterCheck={macMini} />);
  expect(screen.getByText(/Docker isn't installed/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Next" }).hasAttribute("disabled")).toBe(true);
  click("Check again");
  expect(screen.queryByText(/Docker isn't installed/)).toBeNull();
  click("Next");
  expect(screen.getByRole("heading", { name: "Choose the AI models" })).toBeTruthy();
});

it("a failed service test names the service and offers Retry, which carries on", () => {
  vi.useFakeTimers();
  render(
    <Installer
      step="start"
      tests={{ runtime: "ok", "llm-api": "failed" }}
      failingService="llm-api"
      tickMs={10}
    />,
  );
  expect(screen.getByText("LLM API didn't pass its test.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Make my invite" }).hasAttribute("disabled")).toBe(
    true,
  );
  click("Retry");
  // running → ok for the LLM API, then waiting → running → ok for the indexer and the hub.
  for (let i = 0; i < 5; i++) act(() => vi.advanceTimersByTime(10));
  expect(screen.queryByText("LLM API didn't pass its test.")).toBeNull();
  click("Make my invite");
  expect(screen.getByRole("heading", { name: "Invite yourself" })).toBeTruthy();
});

it("ends with the admin's invite link", () => {
  render(<Installer step="invite" names={{ group: "Café Léon", admin: "Léon" }} />);
  expect((screen.getByLabelText("Your invite link") as HTMLInputElement).value).toBe(
    "https://app.sandclaw.ai/join#k=a41d07b9-cafe-leon-admin",
  );
  expect(screen.getByRole("img", { name: "QR code" })).toBeTruthy();
});
