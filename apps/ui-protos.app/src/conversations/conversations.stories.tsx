import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConversationsSidebar, ConversationsSwitcher } from "./conversations.js";

const meta = {
  title: "Prototypes/Chat — conversations",
  component: ConversationsSidebar,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="grid min-h-svh grid-cols-[minmax(0,1fr)] place-items-center p-4">
        <Story />
      </div>
    ),
  ],
  args: { delay: 600 },
} satisfies Meta<typeof ConversationsSidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Sidebar: Story = {
  name: "A — List in the side panel",
};

export const Switcher: Story = {
  name: "B — Switcher in the assistant header",
  render: (args) => <ConversationsSwitcher {...args} />,
};

export const SwitcherOpen: Story = {
  name: "B — Switcher, list open",
  render: (args) => <ConversationsSwitcher {...args} listOpen />,
};

export const FirstVisit: Story = {
  name: "First chat",
  args: { firstVisit: true },
};

export const FirstVisitSwitcher: Story = {
  name: "First chat, in the assistant header",
  args: { firstVisit: true },
  render: (args) => <ConversationsSwitcher {...args} />,
};
