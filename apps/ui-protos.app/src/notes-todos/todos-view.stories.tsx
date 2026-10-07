import type { Meta, StoryObj } from "@storybook/react-vite";
import { TodosView } from "./todos-view.js";

const meta = {
  title: "Prototypes/Notes and todos",
  component: TodosView,
  decorators: [
    (Story) => (
      <div className="bg-muted flex h-screen">
        <div className="bg-background h-full w-[300px] border-r">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof TodosView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ByFile: Story = { name: "A — Grouped by file", args: { grouping: "by-file" } };

export const OneList: Story = { name: "B — One list", args: { grouping: "one-list" } };
