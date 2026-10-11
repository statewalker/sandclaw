import { Button } from "@statewalker/ui.view.shadcn";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { AgentTools, type AgentToolsProps } from "./agent-tools.js";
import { spreadsheet, toolSources, untouchedSettings } from "./mock-tools.js";

const meta = {
  title: "Prototypes/Agent tools",
  component: AgentTools,
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
} satisfies Meta<typeof AgentTools>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The Spreadsheet app opened and closed, as its registry joins and leaves the composition. */
function LiveApps(props: AgentToolsProps) {
  const [loaded, setLoaded] = useState(true);
  const sources = toolSources.map((s) => (s === spreadsheet ? { ...s, loaded } : s));
  return (
    <div className="grid w-full max-w-2xl gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-2 text-xs">
        <span className="text-muted-foreground flex-1">Prototype only:</span>
        <Button size="sm" variant="outline" onClick={() => setLoaded(!loaded)}>
          {loaded ? "Close the Spreadsheet app" : "Open the Spreadsheet app"}
        </Button>
      </div>
      <AgentTools {...props} sources={sources} />
    </div>
  );
}

export const Rows: Story = {
  name: "A — Every command with its own control",
  args: { variant: "rows" },
};

export const Groups: Story = {
  name: "B — One control per group",
  args: { variant: "groups" },
};

export const AppComesAndGoes: Story = {
  name: "An app loads and closes",
  args: { variant: "groups" },
  render: (args) => <LiveApps {...args} />,
};

export const Untouched: Story = {
  name: "Nothing chosen yet",
  args: { variant: "rows", settings: untouchedSettings },
};

export const SearchDelete: Story = {
  name: "Search: “delete”",
  args: { variant: "rows", query: "delete" },
};

export const NoMatch: Story = {
  name: "No search match",
  args: { variant: "groups", query: "calendar" },
};
