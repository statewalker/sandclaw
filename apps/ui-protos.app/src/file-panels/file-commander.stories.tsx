import type { FilesApi } from "@statewalker/webrun-files";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { newDemoStorages } from "./demo-storages.js";
import { FileCommander, type FileCommanderProps } from "./file-commander.js";

/** Fresh storages per render, so one story's copies and deletes don't show up in another. */
function DemoCommander({
  options,
  prepare,
  ...props
}: Omit<FileCommanderProps, "storages"> & {
  options?: Parameters<typeof newDemoStorages>[0];
  /** Extra files written before the commander opens. */
  prepare?: (files: FilesApi) => Promise<void>;
}) {
  const [storages] = useState(() => newDemoStorages(options));
  const [ready, setReady] = useState(!prepare);
  useEffect(() => {
    prepare?.(storages.files).then(() => setReady(true));
  }, []);
  return ready ? <FileCommander {...props} storages={storages} /> : <p>Loading…</p>;
}

const meta = {
  title: "Files/Commander",
  component: DemoCommander,
  parameters: { layout: "fullscreen" },
  // Centred by a grid, not by Storybook's "centered" layout: that one sizes the
  // story to its content, so a phone-width viewport scrolls sideways.
  // A commander fills the screen instead, so here the wrapper is full height.
  decorators: [
    (Story) => (
      <div className="h-svh p-2">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DemoCommander>;

export default meta;
type Story = StoryObj<typeof meta>;

const bytes = (n: number) => [new Uint8Array(n).fill(66)];

export const TwoPanels: Story = {
  name: "A — Two panels side by side",
  args: {},
};

export const ThreePanels: Story = {
  name: "A — Three panels",
  args: { panels: ["/documents/clients", "/archive/2025", "/photos/site-visit"] },
};

export const CopyDialogOne: Story = {
  name: "Copy one file (F5)",
  args: { initial: { dialog: "copy", selected: ["/documents/clients/dupont/offer.pdf"] } },
};

export const CopyDialogClashes: Story = {
  name: "Copy two files that are already there",
  args: {
    prepare: async (files) => {
      await files.write("/archive/2025/clients/dupont/offer.pdf", bytes(200_000));
      await files.write("/archive/2025/clients/dupont/plan.png", bytes(70_000));
    },
    panels: ["/documents/clients/dupont", "/archive/2025/clients/dupont"],
    initial: {
      dialog: "copy",
      selected: ["/documents/clients/dupont/offer.pdf", "/documents/clients/dupont/plan.png"],
    },
  },
};

export const SlowUpload: Story = {
  name: "Slow S3: drag backup.zip or press F5 on it",
  args: { options: { slowMs: 300 } },
};

export const FailedItem: Story = {
  name: "One item fails, the rest goes on",
  args: {
    options: { failPaths: ["/archive/2025/notes.md"] },
    panels: ["/documents/clients/martin", "/archive/2025"],
    initial: {
      dialog: "copy",
      selected: ["/documents/clients/martin/contract.docx", "/documents/clients/martin/notes.md"],
    },
  },
};

export const LockedArchive: Story = {
  name: "Archive locked",
  args: {
    options: {
      unavailable: {
        archive: { cause: "locked", message: "Locked: unlock to use the S3 storages." },
      },
    },
  },
};

export const S3Unreachable: Story = {
  name: "Photos bucket not answering",
  args: {
    options: {
      unavailable: {
        photos: { cause: "unreachable", message: "No answer from https://s3.example.com." },
      },
    },
    panels: ["/documents/clients", "/photos/site-visit"],
  },
};

export const DeleteConfirm: Story = {
  name: "Delete asks first (F8)",
  args: { initial: { dialog: "delete", selected: ["/documents/clients/martin"] } },
};

export const Phone: Story = {
  name: "Phone: one panel at a time",
  args: { phone: true },
};
