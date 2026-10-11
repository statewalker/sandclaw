import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fakeProbe, type ProbeScenario } from "./connection-test.js";
import { MockVault, type VaultState } from "./mock-vault.js";
import type { S3Form } from "./mount-config.js";
import { s3FormOf } from "./mount-form.js";
import { corsRule } from "./s3-problems.js";
import {
  type StorageItem,
  StorageSettings,
  type StorageSettingsProps,
} from "./storage-settings.js";

const ORIGIN = "https://files.sandclaw.app";

export const DEMO_MOUNTS: StorageItem[] = [
  {
    config: {
      key: "documents",
      name: "Documents",
      type: "local-folder",
      config: { folder: "Documents" },
    },
    status: { state: "mounted" },
    where: "Documents on this computer",
  },
  {
    config: { key: "browser", name: "Browser storage", type: "opfs", config: {} },
    status: { state: "mounted" },
    where: "In this browser",
  },
  {
    config: {
      key: "archive",
      name: "Archive (S3)",
      type: "s3",
      config: {
        preset: "aws",
        endpoint: "https://s3.eu-central-1.amazonaws.com",
        region: "eu-central-1",
        bucket: "acme-archive",
        prefix: "",
        pathStyle: "false",
      },
    },
    status: { state: "locked" },
    where: "s3.eu-central-1.amazonaws.com · acme-archive/",
  },
  {
    config: {
      key: "photos",
      name: "Photos (S3)",
      type: "s3",
      config: {
        preset: "r2",
        endpoint: "https://4f9a2c.r2.cloudflarestorage.com",
        region: "auto",
        bucket: "acme-photos",
        prefix: "site-visits/",
        pathStyle: "false",
      },
    },
    status: {
      state: "failed",
      problem: {
        cause: "cors",
        message: "The bucket doesn't allow this site. Add this CORS rule to the bucket:",
        detail: "TypeError: Failed to fetch",
        fix: { kind: "cors-rule", json: corsRule(ORIGIN) },
      },
    },
    where: "4f9a2c.r2.cloudflarestorage.com · acme-photos/site-visits/",
  },
  {
    config: {
      key: "old-nas",
      name: "Old NAS (S3)",
      type: "s3",
      config: {
        preset: "minio",
        endpoint: "https://nas.example.com:9000",
        region: "us-east-1",
        bucket: "files",
        prefix: "",
        pathStyle: "true",
      },
    },
    status: { state: "unmounted" },
    where: "nas.example.com:9000 · files/",
  },
];

/** A demo storage's S3 form with keys typed in, for the connection-test stories. */
function filled(key: string): S3Form {
  const mount = DEMO_MOUNTS.find((m) => m.config.key === key);
  if (!mount) throw new Error(`No demo storage ${key}`);
  return {
    ...s3FormOf(mount.config),
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  };
}
const ARCHIVE = filled("archive");
const PHOTOS = filled("photos");

/** A fresh vault and probe per render, so one story's unlock or reset doesn't leak into another. */
function DemoSettings({
  vault: vaultState,
  scenario = "ok",
  delayMs = 0,
  ...props
}: Omit<StorageSettingsProps, "vault" | "probe" | "origin" | "mounts"> & {
  vault: VaultState;
  scenario?: ProbeScenario;
  delayMs?: number;
}) {
  const [vault] = useState(
    () =>
      new MockVault({
        state: vaultState,
        password: vaultState === "absent" ? undefined : "correct horse",
      }),
  );
  const mounts = DEMO_MOUNTS.map((m) =>
    vaultState === "unlocked" && m.status.state === "locked"
      ? { ...m, status: { state: "mounted" as const } }
      : m,
  );
  return (
    <StorageSettings
      {...props}
      mounts={mounts}
      vault={vault}
      probe={() => fakeProbe(scenario, delayMs)}
      origin={ORIGIN}
    />
  );
}

const meta = {
  title: "Prototypes/Files app/Storage settings",
  // The demo data is exported for the component test, not a story.
  excludeStories: ["DEMO_MOUNTS"],
  component: DemoSettings,
  parameters: { layout: "fullscreen" },
  // Centred by a grid, not by Storybook's "centered" layout: that one sizes the
  // story to its content, so a phone-width viewport scrolls sideways.
  decorators: [
    (Story) => (
      <div className="grid min-h-svh grid-cols-[minmax(0,1fr)] place-items-center p-4">
        <Story />
      </div>
    ),
  ],
  args: { vault: "unlocked" },
  argTypes: {
    vault: { control: "inline-radio", options: ["absent", "locked", "unlocked"] },
  },
} satisfies Meta<typeof DemoSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

const testing = (scenario: ProbeScenario, form = ARCHIVE): Story["args"] => ({
  vault: "unlocked",
  scenario,
  delayMs: 400,
  opened: { edit: form.key, form, test: true },
});

export const List: Story = { name: "A — Storages (keys unlocked)", args: { vault: "unlocked" } };

export const ListLocked: Story = {
  name: "Storages at start-up (keys locked)",
  args: { vault: "locked" },
};

export const AddChooseType: Story = {
  name: "Add: choose a type",
  args: { opened: { add: "choose" }, localFoldersAvailable: true },
};

export const AddS3: Story = { name: "Add: S3 form", args: { opened: { add: "s3" } } };

export const TestPassing: Story = { name: "Test: every check passes", args: testing("ok") };
export const TestBadKeys: Story = { name: "Test: wrong keys", args: testing("bad-keys") };
export const TestNoBucket: Story = { name: "Test: no such bucket", args: testing("no-bucket") };
export const TestDeniedWrite: Story = {
  name: "Test: keys can't write",
  args: testing("denied-write"),
};
export const TestCors: Story = { name: "Test: CORS rule missing", args: testing("cors", PHOTOS) };
export const TestUnreachable: Story = {
  name: "Test: no answer",
  args: testing("unreachable"),
};
export const TestClockSkew: Story = { name: "Test: clock off", args: testing("clock-skew") };

export const CreateVault: Story = {
  name: "Keys: create the password",
  args: { vault: "absent", opened: { vault: "create" } },
};

export const UnlockVault: Story = {
  name: "Keys: unlock (password: correct horse)",
  args: { vault: "locked", opened: { vault: "unlock" } },
};

export const ChangePassword: Story = {
  name: "Keys: change the password",
  args: { vault: "unlocked", opened: { vault: "change" } },
};

export const NoLocalFolders: Story = {
  name: "Add: no local folders in this browser",
  args: { opened: { add: "choose" }, localFoldersAvailable: false },
};

export const Phone: Story = {
  name: "Phone",
  args: { vault: "locked", phone: true },
};
