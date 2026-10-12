import type { ProbeScenario, S3Form } from "@statewalker/file-mounts.core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { DemoStorageSettings } from "./demo-storage-settings.js";

/** A new S3 storage, its form filled in, for the connection-test stories. */
const KEYS = {
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
};
const BACKUPS: S3Form = {
  name: "Backups (S3)",
  key: "backups",
  preset: "aws",
  endpoint: "https://s3.eu-central-1.amazonaws.com",
  region: "eu-central-1",
  bucket: "acme-backups",
  prefix: "",
  pathStyle: false,
  readOnly: false,
  ...KEYS,
};
const SITE_PHOTOS: S3Form = {
  ...BACKUPS,
  name: "Site photos (S3)",
  key: "site-photos",
  preset: "r2",
  endpoint: "https://4f9a2c.r2.cloudflarestorage.com",
  region: "auto",
  bucket: "acme-site-photos",
};

const meta = {
  title: "Files/Storage settings",
  component: DemoStorageSettings,
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
} satisfies Meta<typeof DemoStorageSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

const testing = (scenario: ProbeScenario, draft = BACKUPS): Story["args"] => ({
  vault: "unlocked",
  scenario,
  delayMs: 400,
  opened: { add: "s3", draft, test: true },
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
export const TestCors: Story = {
  name: "Test: CORS rule missing",
  args: testing("cors", SITE_PHOTOS),
};
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
