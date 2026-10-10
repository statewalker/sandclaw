import type { Meta, StoryObj } from "@storybook/react-vite";
import { MyIdentityCard, MyIdentityPage } from "./my-identity.js";

const meta = {
  title: "Prototypes/My identity and devices",
  component: MyIdentityPage,
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
} satisfies Meta<typeof MyIdentityPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SettingsPage: Story = {
  name: "A — One settings page",
  args: {},
};

export const CompactCard: Story = {
  name: "B — Compact card from the avatar",
  render: (args) => <MyIdentityCard {...args} />,
  args: {},
};

export const CompactCardLockOn: Story = {
  name: "B — Compact card, lock on (Lock now)",
  render: (args) => <MyIdentityCard {...args} />,
  args: { lock: "on" },
};

export const OnlyDevice: Story = {
  name: "Only device (press Leave)",
  args: { onlyDevice: true },
};

export const Locked: Story = {
  name: "Locked browser: unlock screen",
  args: { lock: "locked" },
};

export const MachineOffline: Story = {
  name: "Sandclaw machine offline",
  args: { machineOnline: false },
};
