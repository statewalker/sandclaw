import type { Meta, StoryObj } from "@storybook/react-vite";
import { arriving, backOnline, history } from "./notices-mock.js";
import { NotificationSettings } from "./notification-settings.js";
import { Notifications } from "./notifications.js";

const meta = {
  title: "Prototypes/Notifications",
  component: Notifications,
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
    variant: { control: "inline-radio", options: ["bell", "panel"] },
    viewer: { control: "inline-radio", options: ["admin", "member"] },
  },
} satisfies Meta<typeof Notifications>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BellAndToasts: Story = {
  name: "A — Bell dropdown, toasts bottom-right",
  args: { variant: "bell", notices: history, arriving },
};

export const BellOpen: Story = {
  name: "A — Bell opened",
  args: { variant: "bell", notices: history, arriving, defaultOpen: true },
};

export const ActivityPanel: Story = {
  name: "B — Activity panel, minimal toasts",
  args: { variant: "panel", notices: history, arriving },
};

export const ActivityPanelOpen: Story = {
  name: "B — Activity panel opened",
  args: { variant: "panel", notices: history, arriving, defaultOpen: true },
};

export const NothingNew: Story = {
  name: "Nothing new",
  args: { variant: "bell", notices: [], defaultOpen: true },
};

export const BackOnline: Story = {
  name: "Back online after 2 h — 2 tasks resumed",
  args: { variant: "bell", notices: backOnline.history, arriving: backOnline.arriving },
};

export const Member: Story = {
  name: "Member — no team or service notices",
  args: { variant: "bell", viewer: "member", notices: history, arriving, defaultOpen: true },
};

export const Settings: Story = {
  name: "Settings — admin",
  render: () => (
    <div className="bg-background w-full max-w-lg rounded-lg border">
      <NotificationSettings
        viewer="admin"
        settings={{ "indexing-done": "off" }}
        onClear={() => {}}
      />
    </div>
  ),
};

export const SettingsBlocked: Story = {
  name: "Settings — member, browser notifications blocked",
  render: () => (
    <div className="bg-background w-full max-w-lg rounded-lg border">
      <NotificationSettings viewer="member" osPermission="denied" />
    </div>
  ),
};
