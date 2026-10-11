import type { Meta, StoryObj } from "@storybook/react-vite";
import { TasksStrip } from "./tasks-strip.js";

const meta = {
  title: "Prototypes/Chat — tasks and outputs",
  component: TasksStrip,
  parameters: { layout: "fullscreen" },
  // The strip as it sits in the workspace's bottom zone, under the documents.
  decorators: [
    (Story) => (
      <div className="bg-muted flex h-svh flex-col">
        <div className="text-muted-foreground grid flex-1 place-items-center text-xs">
          Documents
        </div>
        <Story />
      </div>
    ),
  ],
  argTypes: {
    scenario: {
      control: "inline-radio",
      options: ["everything", "empty", "running", "waiting", "failed", "done"],
    },
    variant: { control: "inline-radio", options: ["list", "timeline"] },
  },
} satisfies Meta<typeof TasksStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const List: Story = {
  name: "A — A list",
  args: { scenario: "everything", variant: "list", defaultOpen: true },
};

export const Timeline: Story = {
  name: "B — A timeline by day",
  args: { scenario: "everything", variant: "timeline", defaultOpen: true },
};

export const FilesProduced: Story = {
  name: "Files produced",
  args: { scenario: "everything", defaultOpen: true, defaultTab: "files" },
};

export const CollapsedRunning: Story = {
  name: "Collapsed — running",
  args: { scenario: "running" },
};

export const CollapsedWaiting: Story = {
  name: "Collapsed — waiting for you",
  args: { scenario: "waiting" },
};

export const CollapsedBusy: Story = {
  name: "Collapsed — running, and one waiting for you",
  args: { scenario: "everything" },
};

export const CollapsedDone: Story = {
  name: "Collapsed — all done",
  args: { scenario: "done" },
};

export const Empty: Story = {
  name: "Nothing yet",
  args: { scenario: "empty", defaultOpen: true },
};

export const Running: Story = {
  name: "Running",
  args: { scenario: "running", defaultOpen: true },
};

export const Waiting: Story = {
  name: "Waiting for you",
  args: { scenario: "waiting", defaultOpen: true },
};

export const Failed: Story = {
  name: "Failed",
  args: { scenario: "failed", defaultOpen: true },
};

export const AllDone: Story = {
  name: "All done",
  args: { scenario: "done", defaultOpen: true },
};
