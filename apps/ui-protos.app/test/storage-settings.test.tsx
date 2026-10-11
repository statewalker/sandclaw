import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { fakeProbe } from "../src/file-mounts/connection-test.js";
import { MockVault } from "../src/file-mounts/mock-vault.js";
import { StorageSettings } from "../src/file-mounts/storage-settings.js";
import { DEMO_MOUNTS } from "../src/file-mounts/storage-settings.stories.js";

afterEach(cleanup);
const origin = "https://files.sandclaw.app";

const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("StorageSettings", () => {
  it("adds an S3 storage after a passing test, creating the vault first", async () => {
    render(
      <StorageSettings
        mounts={DEMO_MOUNTS}
        vault={new MockVault({ state: "absent" })}
        probe={() => fakeProbe("ok")}
        origin={origin}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add storage" }));
    fireEvent.click(screen.getByRole("button", { name: /S3/ }));
    fill("Name", "Backups");
    fill("Endpoint", "https://s3.example.com");
    fill("Bucket", "backups");
    fill("Access key ID", "AKIA123");
    fill("Secret access key", "secret");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const dialog = await screen.findByRole("dialog", { name: "Protect your keys with a password" });
    fireEvent.change(within(dialog).getByLabelText("Password"), {
      target: { value: "correct horse" },
    });
    fireEvent.change(within(dialog).getByLabelText("Repeat the password"), {
      target: { value: "correct horse" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    expect(await screen.findByRole("row", { name: /Backups/ })).toBeTruthy();
  });

  it("a failed test shows the cause, the CORS rule for this page's address, and Save anyway", async () => {
    render(
      <StorageSettings
        mounts={DEMO_MOUNTS}
        vault={new MockVault({ state: "unlocked", password: "correct horse" })}
        probe={() => fakeProbe("cors")}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add storage" }));
    fireEvent.click(screen.getByRole("button", { name: /S3/ }));
    fill("Name", "Backups");
    fill("Endpoint", "https://s3.example.com");
    fill("Bucket", "backups");
    fill("Access key ID", "AKIA123");
    fill("Secret access key", "secret");
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    expect(
      await screen.findByText(
        "The bucket doesn't allow this site. Add this CORS rule to the bucket:",
      ),
    ).toBeTruthy();
    expect(screen.getByText(/x-amz-copy-source/).textContent).toContain(
      `"${window.location.origin}"`,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("button", { name: "Save anyway" })).toBeTruthy();
  });

  it("a storage saved anyway after a failed test is listed as Failed with that test's reason", async () => {
    render(
      <StorageSettings
        mounts={DEMO_MOUNTS}
        vault={new MockVault({ state: "unlocked", password: "correct horse" })}
        probe={() => fakeProbe("cors")}
        origin={origin}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add storage" }));
    fireEvent.click(screen.getByRole("button", { name: /S3/ }));
    fill("Name", "Backups");
    fill("Endpoint", "https://s3.example.com");
    fill("Bucket", "backups");
    fill("Access key ID", "AKIA123");
    fill("Secret access key", "secret");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save anyway" }));
    const row = await screen.findByRole("row", { name: /Backups/ });
    expect(within(row).getByText("Failed")).toBeTruthy();
    expect(
      within(row).getByText(
        "The bucket doesn't allow this site. Add this CORS rule to the bucket:",
      ),
    ).toBeTruthy();
  });

  it("shows field errors in plain words", async () => {
    render(
      <StorageSettings
        mounts={DEMO_MOUNTS}
        vault={new MockVault({ state: "unlocked", password: "x".repeat(8) })}
        probe={() => fakeProbe("ok")}
        origin={origin}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add storage" }));
    fireEvent.click(screen.getByRole("button", { name: /S3/ }));
    expect(screen.queryByText("Enter a name.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Enter a name.")).toBeTruthy();
    expect(screen.getByText("Enter the access key ID.")).toBeTruthy();
  });

  it("unlocking the vault mounts the locked S3 storages", async () => {
    render(
      <StorageSettings
        mounts={DEMO_MOUNTS}
        vault={new MockVault({ state: "locked", password: "correct horse" })}
        probe={() => fakeProbe("ok")}
        origin={origin}
      />,
    );
    const row = screen.getByRole("row", { name: /Archive \(S3\)/ });
    fireEvent.click(within(row).getByRole("button", { name: "Unlock" }));
    const dialog = await screen.findByRole("dialog", { name: "Unlock your keys" });
    fireEvent.change(within(dialog).getByLabelText("Password"), { target: { value: "wrong" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Unlock" }));
    expect(await within(dialog).findByText("Wrong password.")).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("Password"), {
      target: { value: "correct horse" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Unlock" }));
    expect(
      await within(screen.getByRole("row", { name: /Archive \(S3\)/ })).findByText("Mounted"),
    ).toBeTruthy();
  });
});
