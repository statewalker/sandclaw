import type { Meta, StoryObj } from "@storybook/react-vite";
import { type LinkState, StatusBanner, StatusDot, StatusPill } from "./link-status.js";

type Args = { state: LinkState };

const meta: Meta<Args> = {
  title: "Prototypes/Office link status",
  args: { state: "connected" },
  argTypes: {
    state: { control: "inline-radio", options: ["connected", "connecting", "offline"] },
  },
};

export default meta;
type Story = StoryObj<Args>;

export const Dot: Story = {
  name: "A — Dot",
  render: (args) => <StatusDot {...args} />,
};

export const Pill: Story = {
  name: "B — Pill",
  render: (args) => <StatusPill {...args} />,
};

export const PillOffline: Story = {
  name: "B — Pill (offline)",
  args: { state: "offline" },
  render: (args) => <StatusPill {...args} />,
};

export const Banner: Story = {
  name: "C — Banner (offline)",
  args: { state: "offline" },
  render: (args) => <StatusBanner {...args} />,
};
