import type { Meta, StoryObj } from "@storybook/react-vite";
import { issuedInvites } from "../mock.js";
import { InvitationsLog } from "./invitations-log.js";

const meta = {
  title: "Prototypes/Invitations log",
  component: InvitationsLog,
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
} satisfies Meta<typeof InvitationsLog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A quiet month: the last invite was answered weeks ago. */
const quietInvites = issuedInvites.filter((i) =>
  ["inv_hugo", "inv_ines", "inv_marc"].includes(i.id),
);

export const ByInvite: Story = {
  name: "A — One row per invite",
  args: { variant: "by-invite" },
};

export const EventLog: Story = {
  name: "B — Event log",
  args: { variant: "event-log" },
};

export const Search: Story = {
  name: "Search: “ines”",
  args: { variant: "by-invite", query: "ines" },
};

export const EmptyPeriod: Story = {
  name: "Nothing in the last 7 days",
  args: { variant: "by-invite", period: 7, invites: quietInvites },
};

export const NoMatch: Story = {
  name: "No search match",
  args: { variant: "event-log", query: "Bernard" },
};
