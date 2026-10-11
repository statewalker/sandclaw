import type { Meta, StoryObj } from "@storybook/react-vite";
import { FirstSteps } from "./first-steps.js";

const meta = {
  title: "Prototypes/First steps after joining",
  component: FirstSteps,
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
    guide: { control: "inline-radio", options: ["pointers", "tour", "none"] },
    whileReading: { control: "inline-radio", options: ["ask-now", "wait"] },
  },
} satisfies Meta<typeof FirstSteps>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pointers: Story = {
  name: "A — Pointers in each zone",
  args: { guide: "pointers" },
};

export const Tour: Story = {
  name: "B — Three-step tour",
  args: { guide: "tour" },
};

export const NoGuide: Story = {
  name: "Baseline — no guide",
  args: { guide: "none" },
};

export const ReadingAskNow: Story = {
  name: "Reading: “Ask now — answers improve as I read”",
  args: { guide: "none", whileReading: "ask-now", read: 1 },
};

export const ReadingWait: Story = {
  name: "Reading: suggestions when reading finishes",
  args: { guide: "none", whileReading: "wait", read: 1 },
};

export const EmptyFolder: Story = {
  name: "An empty folder",
  args: { guide: "pointers", emptyFolder: true },
};

export const Dismissed: Story = {
  name: "Dismissed for good",
  args: { dismissed: true },
};
