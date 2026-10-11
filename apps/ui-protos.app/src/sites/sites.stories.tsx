import type { Meta, StoryObj } from "@storybook/react-vite";
import { dupont, finance, howWeWork, leroy } from "./mock-sites.js";
import { Sites } from "./sites.js";

const meta = {
  title: "Prototypes/Sites",
  component: Sites,
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
} satisfies Meta<typeof Sites>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The Dupont site with nothing changed since it was built. */
const dupontCurrent = { ...dupont, changedFiles: [] };

export const Cards: Story = {
  name: "A — Cards, progress on its own page",
  args: { layout: "cards", progress: "page", live: true },
};

export const Rows: Story = {
  name: "B — Rows, progress inline",
  args: { layout: "rows", progress: "inline", live: true },
};

export const NewFromFolder: Story = {
  name: "New site from a folder",
  args: { initialNew: "folder" },
};

export const NewFromTopics: Story = {
  name: "New default site from topics",
  args: { initialNew: "topics" },
};

export const Generating: Story = {
  name: "Generation, page by page",
  args: { live: true, initialView: { kind: "progress", siteId: howWeWork.id } },
};

export const SomeFailed: Story = {
  name: "Some pages failed",
  args: { initialView: { kind: "progress", siteId: finance.id } },
};

export const Viewer: Story = {
  name: "Site viewer",
  args: {
    sites: [dupontCurrent, howWeWork, finance, leroy],
    initialView: { kind: "viewer", siteId: dupont.id },
  },
};

export const ViewerStale: Story = {
  name: "Site viewer — files changed",
  args: { initialView: { kind: "viewer", siteId: dupont.id } },
};

export const Empty: Story = {
  name: "No sites yet",
  args: { sites: [] },
};
