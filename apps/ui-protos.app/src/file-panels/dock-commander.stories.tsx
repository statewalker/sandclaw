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

export const Tabs: Story = {
  name: "Panels as tabs (drag a tab to split)",
  args: {},
};

export const Split: Story = {
  name: "Split by the user",
  args: { split: true },
};

export const ThreeTabs: Story = {
  name: "Three panels as tabs",
  args: { panels: ["/documents/clients", "/archive/2025", "/photos/site-visit"] },
};

export const CopyToTab: Story = {
  name: "Copy (F5) to another tab",
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
  name: "Phone: one tab at a time, no drag",
  args: { phone: true },
};
