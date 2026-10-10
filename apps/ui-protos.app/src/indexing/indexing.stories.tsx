import type { Meta, StoryObj } from "@storybook/react-vite";
import { IndexingPage, IndexingTree } from "./indexing.js";

const meta = {
  title: "Prototypes/Ask — indexing",
  component: IndexingPage,
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
    scenario: { control: "inline-radio", options: ["first-reading", "all-read", "with-failures"] },
  },
} satisfies Meta<typeof IndexingPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The tree as it sits on the left of the workspace (the folder zone's width). */
const inZone: Story["decorators"] = [
  (Story) => (
    <div className="bg-background h-[640px] max-h-[90svh] w-[300px] max-w-full overflow-hidden rounded-md border">
      <Story />
    </div>
  ),
];

export const SettingsPage: Story = {
  name: "A — Settings page: first reading",
  args: { scenario: "first-reading", live: true },
};

export const InTree: Story = {
  name: "B — In the folder tree: first reading",
  args: { scenario: "first-reading", live: true },
  decorators: inZone,
  render: (args) => <IndexingTree {...args} />,
};

export const AllRead: Story = {
  name: "Everything read",
  args: { scenario: "all-read" },
};

export const Offline: Story = {
  name: "Machine offline",
  args: { scenario: "first-reading", offline: true, live: true },
};

export const WithFailures: Story = {
  name: "With failures and changes",
  args: { scenario: "with-failures" },
};

export const InTreeOffline: Story = {
  name: "B — Machine offline",
  args: { scenario: "first-reading", offline: true },
  decorators: inZone,
  render: (args) => <IndexingTree {...args} />,
};

export const InTreeFailures: Story = {
  name: "B — With failures and changes",
  args: { scenario: "with-failures" },
  decorators: inZone,
  render: (args) => <IndexingTree {...args} />,
};
