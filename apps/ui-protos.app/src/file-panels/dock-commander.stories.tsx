import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { newDemoStorages } from "./demo-storages.js";
import { DockCommander, type DockCommanderProps } from "./dock-commander.js";

/** Fresh storages per render, so one story's copies and deletes don't show up in another. */
function DemoDockCommander({
  options,
  ...props
}: Omit<DockCommanderProps, "storages"> & {
  options?: Parameters<typeof newDemoStorages>[0];
}) {
  const [storages] = useState(() => newDemoStorages(options));
  return <DockCommander {...props} storages={storages} />;
}

const meta = {
  title: "Files/Commander on the dock",
  component: DemoDockCommander,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="h-svh p-2">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DemoDockCommander>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SideBySide: Story = {
  name: "Panels side by side (drag a tab to rearrange)",
  args: {},
};

export const ThreePanels: Story = {
  name: "Three panels",
  args: { panels: ["/documents/clients", "/archive/2025", "/photos/site-visit"] },
};

export const CopyToPanel: Story = {
  name: "Copy (F5) to the other panel",
  args: { initial: { dialog: "copy", selected: ["/documents/clients/dupont/offer.pdf"] } },
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

export const Phone: Story = {
  name: "Phone: panels as tabs, one at a time, no drag",
  args: { phone: true },
};
