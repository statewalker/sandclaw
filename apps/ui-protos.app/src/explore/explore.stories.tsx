import type { Meta, StoryObj } from "@storybook/react-vite";
import { IndexExplorer } from "./explore.js";

const meta = {
  title: "Prototypes/Explore — the indexes",
  component: IndexExplorer,
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
} satisfies Meta<typeof IndexExplorer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Tabs: Story = {
  name: "A — Tabs: Topics",
  args: { variant: "tabs", tab: "topics" },
};

export const TabsContents: Story = {
  name: "A — Tabs: a document's contents",
  args: { variant: "tabs", tab: "contents", path: "Notes/meeting 2026-10-02.md" },
};

export const TabsSearch: Story = {
  name: "A — Tabs: search “Dupont start date”",
  args: { variant: "tabs", tab: "search", query: "Dupont start date" },
};

export const SearchFirst: Story = {
  name: "B — Search first, topics below",
  args: { variant: "search-first" },
};

export const SearchFirstQuery: Story = {
  name: "B — Search first: “oak beams”",
  args: { variant: "search-first", query: "oak beams" },
};

export const OnlyMeaning: Story = {
  name: "Search filtered to Meaning",
  args: { variant: "tabs", tab: "search", query: "oak beams", only: "meaning" },
};

export const NothingFound: Story = {
  name: "Search: nothing found",
  args: { variant: "tabs", tab: "search", query: "insurance" },
};
