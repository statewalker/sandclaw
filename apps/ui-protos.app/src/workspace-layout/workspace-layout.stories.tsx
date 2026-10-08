import type { Meta, StoryObj } from "@storybook/react-vite";
import { Workspace } from "./workspace.js";

const meta = {
  title: "Prototypes/Workspace layout",
  component: Workspace,
} satisfies Meta<typeof Workspace>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PerZone: Story = {
  name: "C — Fixed bars, each unlockable",
  args: { lockMode: "per-zone" },
};

export const LockToggle: Story = {
  name: "A — Lock toggle (locked by default)",
};

export const AlwaysOn: Story = {
  name: "B — Always movable, tab strips on hover",
  args: { lockMode: "always-on" },
};

export const Reading: Story = {
  name: "Reading layout",
  args: { initialLayout: "reading" },
};
