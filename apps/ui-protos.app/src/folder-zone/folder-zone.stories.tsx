import type { Meta, StoryObj } from "@storybook/react-vite";
import { FolderZone } from "./folder-zone.js";

const meta = {
  title: "Prototypes/Folder zone",
  component: FolderZone,
  // The zone as it sits on the left of the workspace.
  decorators: [
    (Story) => (
      <div className="bg-muted flex h-screen">
        <div className="bg-background h-full w-[280px] border-r">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof FolderZone>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = { name: "Ready", args: { state: "ready" } };

export const IndexingFooter: Story = {
  name: "A — Indexing: progress bar",
  args: { state: "indexing", indexing: "footer" },
};

export const IndexingMarks: Story = {
  name: "B — Indexing: unread files dimmed",
  args: { state: "indexing", indexing: "marks" },
};

export const NeedsAccess: Story = {
  name: "After a restart: reconnect",
  args: { state: "needs-access" },
};

export const Empty: Story = { name: "No folder yet", args: { state: "empty" } };
