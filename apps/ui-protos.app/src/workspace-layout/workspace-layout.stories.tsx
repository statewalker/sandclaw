import type { Meta, StoryObj } from "@storybook/react-vite";
import type { JSX } from "react";
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

// The workspace follows its own width, so a narrow frame shows the narrow modes.
const frame = (width: number) => (Story: () => JSX.Element) => (
  <div style={{ width, margin: "0 auto", borderInline: "1px solid var(--border)" }}>
    <Story />
  </div>
);

export const Compact: Story = {
  name: "Compact (800 px wide): side panels as overlays",
  args: { lockMode: "per-zone" },
  decorators: [frame(800)],
};

export const Mobile: Story = {
  name: "Mobile (390 px wide): one panel at a time",
  args: { lockMode: "per-zone" },
  decorators: [frame(390)],
};
