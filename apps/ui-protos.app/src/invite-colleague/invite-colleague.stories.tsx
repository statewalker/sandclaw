import type { Meta, StoryObj } from "@storybook/react-vite";
import { InviteLinkDialog, TeamPanel } from "./invite-colleague.js";

const meta = {
  title: "Prototypes/Invite colleague",
  parameters: { layout: "centered" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const LinkDialog: Story = {
  name: "A — Link dialog",
  render: () => <InviteLinkDialog defaultOpen />,
};

export const LinkDialogClosed: Story = {
  name: "A — Link dialog (trigger only)",
  render: () => <InviteLinkDialog />,
};

export const Team: Story = {
  name: "B — Team panel",
  render: () => <TeamPanel />,
};
