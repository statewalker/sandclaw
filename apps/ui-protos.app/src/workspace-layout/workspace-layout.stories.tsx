import type { Meta, StoryObj } from "@storybook/react-vite";
import { installedPanels, Workspace } from "./workspace.js";

const meta = {
  title: "Prototypes/Workspace layout",
  component: Workspace,
} satisfies Meta<typeof Workspace>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Assistant: Story = {
  name: "Assistant preset (locked)",
};

export const Unlocked: Story = {
  name: "Assistant preset (unlocked)",
  args: { initiallyLocked: false },
};

export const Reading: Story = {
  name: "Reading preset",
  args: { initialPreset: "reading" },
};

export const PluginMissing: Story = {
  name: "Todos plugin not installed",
  args: { installed: installedPanels.filter((p) => p.id !== "todos") },
};
