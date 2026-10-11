import type { Meta, StoryObj } from "@storybook/react-vite";
import { JoinFlow } from "./join-invite.js";

const meta = {
  title: "Prototypes/Join from invite",
  component: JoinFlow,
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

export const InviteExpired: Story = {
  name: "Invite expired (press Join)",
  args: { outcome: "invite-expired" },
};

export const Decline: Story = {
  name: "Decline: confirm",
  args: { variant: "promises", start: "decline" },
};

export const Declined: Story = {
  name: "After declining",
  args: { start: "declined" },
};

export const DeclineOffline: Story = {
  name: "Decline while the machine is offline (press Decline invite)",
  args: { start: "decline", outcome: "machine-offline" },
};
