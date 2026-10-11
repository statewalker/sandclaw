import type { Meta, StoryObj } from "@storybook/react-vite";
import { TeamOneList, TeamTwoPanes } from "./team.js";

const meta = {
  title: "Prototypes/Team",
  component: TeamOneList,
  parameters: { layout: "fullscreen" },
  argTypes: {
    viewer: { control: "inline-radio", options: ["admin", "member"] },
  },
} satisfies Meta<typeof TeamOneList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OneList: Story = {
  name: "A — One list",
  args: { viewer: "admin" },
};

export const TwoPanes: Story = {
  name: "B — Two panes",
  args: { viewer: "admin" },
  render: (args) => <TeamTwoPanes {...args} />,
};

export const MemberView: Story = {
  name: "Member view",
  args: { viewer: "member" },
};

export const MachineOffline: Story = {
  name: "Sandclaw machine offline",
  args: { viewer: "admin", offline: true },
};
