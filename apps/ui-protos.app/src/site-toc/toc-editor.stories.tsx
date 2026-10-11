import type { Meta, StoryObj } from "@storybook/react-vite";
import { TocEditor } from "./toc-editor.js";
import { dupontToc, editedDupontToc } from "./toc-mock.js";

const meta = {
  title: "Prototypes/Site table of contents",
  component: TocEditor,
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
} satisfies Meta<typeof TocEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Split: Story = {
  name: "A — Tree and details",
  args: { variant: "split", selected: "s_kitchen", keyHints: true },
};

export const Outline: Story = {
  name: "B — Outline, sources in place",
  args: { variant: "outline", expanded: ["s_overview", "s_kitchen"], keyHints: true },
};

export const Empty: Story = {
  name: "Empty: suggest from topics",
  args: { variant: "split", site: "How we work", toc: [] },
};

export const Suggestion: Story = {
  name: "Suggestion over an existing TOC",
  args: { variant: "outline", suggesting: true },
};

export const NoSources: Story = {
  name: "A section with nothing to write from",
  args: { variant: "split", selected: "s_photos" },
};

export const Dragging: Story = {
  name: "Drag: the drop indicator",
  args: {
    variant: "outline",
    dragging: { id: "s_budget", over: "s_overview", place: "after" },
  },
};

export const DraggingInside: Story = {
  name: "Drag: under another section",
  args: {
    variant: "outline",
    dragging: { id: "s_photos", over: "s_schedule", place: "inside" },
  },
};

export const TopicPicker: Story = {
  name: "Topic picker",
  args: { variant: "split", selected: "s_photos", picker: { kind: "topic" } },
};

export const FilePicker: Story = {
  name: "File picker, searching “dupont”",
  args: { variant: "split", selected: "s_overview", picker: { kind: "file", query: "dupont" } },
};

export const Unsaved: Story = {
  name: "Unsaved: pages to rewrite",
  args: { variant: "split", saved: dupontToc, toc: editedDupontToc, selected: "s_kitchen" },
};

export const Phone: Story = {
  name: "Phone (390 px): no drag, “…” menu",
  args: { variant: "split", touch: true, saved: dupontToc, toc: editedDupontToc },
  decorators: [
    (Story) => (
      <div className="w-full max-w-[358px]">
        <Story />
      </div>
    ),
  ],
};
