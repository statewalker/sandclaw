import type { Meta, StoryObj } from "@storybook/react-vite";
import { GroupStatus } from "./group-status.js";

const meta = {
  title: "Prototypes/Group status",
  component: GroupStatus,
  argTypes: {
    state: { control: "inline-radio", options: ["connected", "connecting", "offline"] },
  },
} satisfies Meta<typeof GroupStatus>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pill: Story = {
  name: "A — Pill only (offline)",
  args: { variant: "pill", state: "offline" },
};

export const PillBanner: Story = {
  name: "B — Pill and banner (offline)",
  args: { variant: "pill-banner", state: "offline" },
};

export const Connected: Story = {
  name: "Connected",
  args: { variant: "pill-banner", state: "connected" },
};
