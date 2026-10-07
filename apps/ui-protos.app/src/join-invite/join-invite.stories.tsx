import type { Meta, StoryObj } from "@storybook/react-vite";
import { JoinFlow } from "./join-invite.js";

const meta = {
  title: "Prototypes/Join from invite",
  component: JoinFlow,
  parameters: { layout: "centered" },
} satisfies Meta<typeof JoinFlow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Minimal: Story = {
  name: "A — Minimal",
  args: { variant: "minimal" },
};

export const Promises: Story = {
  name: "B — Three promises",
  args: { variant: "promises" },
};

export const ChooseFolder: Story = {
  name: "After joining: choose a folder",
  args: { start: "joined" },
};

export const MachineOffline: Story = {
  name: "Sandclaw machine offline (press Join)",
  args: { outcome: "machine-offline" },
};

export const InviteUsed: Story = {
  name: "Invite already used (press Join)",
  args: { outcome: "invite-used" },
};
