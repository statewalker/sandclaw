import type { Meta, StoryObj } from "@storybook/react-vite";
import { noteCitation, noteTheirs } from "./files.js";
import { NoteEditor } from "./note-editor.js";

const meta = {
  title: "Prototypes/Note editor",
  component: NoteEditor,
  parameters: { layout: "fullscreen" },
  // Centred by a grid, not by Storybook's "centered" layout: that one sizes the
  // story to its content, so a phone-width viewport scrolls sideways.
  decorators: [
    (Story) => (
      <div className="grid min-h-svh grid-cols-[minmax(0,1fr)] place-items-center p-4">
        <div className="h-[36rem] w-full max-w-4xl overflow-hidden rounded-lg border">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof NoteEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Modes: Story = {
  name: "A — Source | Preview | Side by side",
  args: { variant: "modes" },
};

export const Live: Story = {
  name: "B — One live editor",
  args: { variant: "live" },
};

export const SideBySide: Story = {
  name: "A — Side by side",
  args: { variant: "modes", mode: "split" },
};

export const Saving: Story = {
  name: "Saving…",
  args: { variant: "modes", status: "saving", saveDelay: 3_600_000 },
};

export const Disconnected: Story = {
  name: "Not saved: the folder is disconnected",
  args: { variant: "modes", disconnected: true },
};

export const Conflict: Story = {
  name: "Changed on disk while editing",
  args: { variant: "modes", theirs: noteTheirs },
};

export const Cited: Story = {
  name: "Cited: opened from an answer",
  args: { variant: "modes", citation: noteCitation },
};
