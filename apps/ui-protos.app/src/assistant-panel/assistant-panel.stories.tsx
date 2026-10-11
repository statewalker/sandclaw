import type { Meta, StoryObj } from "@storybook/react-vite";
import { AssistantPanel } from "./assistant-panel.js";

const meta = {
  title: "Prototypes/Assistant panel",
  component: AssistantPanel,
  // The panel as it sits in the workspace's right zone.
  decorators: [
    (Story) => (
      <div className="bg-muted flex h-screen justify-end">
        <div className="h-full w-[380px] border-l">
          <Story />
        </div>
      </div>
    ),
  ],
  argTypes: {
    scenario: { control: "inline-radio", options: ["deck", "todos", "mail"] },
    placement: { control: "inline-radio", options: ["inline", "pinned"] },
  },
} satisfies Meta<typeof AssistantPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Deck: Story = {
  name: "Task with an output",
  args: { scenario: "deck" },
};

export const ApprovalInline: Story = {
  name: "A — Approval inline",
  args: { scenario: "todos", placement: "inline" },
};

export const ApprovalPinned: Story = {
  name: "B — Approval pinned above the box",
  args: { scenario: "todos", placement: "pinned" },
};

export const ConsentInline: Story = {
  name: "A — Connector consent inline",
  args: { scenario: "mail", placement: "inline" },
};

export const ConsentPinned: Story = {
  name: "B — Connector consent pinned",
  args: { scenario: "mail", placement: "pinned" },
};
