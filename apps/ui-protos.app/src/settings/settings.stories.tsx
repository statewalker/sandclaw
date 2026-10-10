import type { Meta, StoryObj } from "@storybook/react-vite";
import { Appearance } from "./appearance.js";
import { Settings } from "./settings.js";

const meta = {
  title: "Prototypes/Settings",
  component: Settings,
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
  argTypes: {
    variant: { control: "inline-radio", options: ["page", "dialog"] },
    viewer: { control: "inline-radio", options: ["admin", "member"] },
  },
} satisfies Meta<typeof Settings>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Page: Story = {
  name: "A — Full page (admin)",
  args: { variant: "page", viewer: "admin" },
};

export const InDialog: Story = {
  name: "B — Dialog over the workspace (admin)",
  args: { variant: "dialog", viewer: "admin" },
};

export const Member: Story = {
  name: "Member: no admin group",
  args: { variant: "page", viewer: "member" },
};

export const DeepLinkTeam: Story = {
  name: "Deep link: opened at Team",
  args: { variant: "page", viewer: "admin", section: "team" },
};

export const SearchLock: Story = {
  name: "Search: “lock”",
  args: { variant: "page", viewer: "admin", query: "lock" },
};

export const PhoneList: Story = {
  name: "Phone: the section list",
  args: { viewer: "admin", phone: true },
};

export const PhoneSubPage: Story = {
  name: "Phone: a section, with Back",
  args: { viewer: "admin", phone: true, section: "connectors" },
};

export const AppearanceSection: Story = {
  name: "Appearance",
  args: {},
  render: () => <Appearance />,
};
