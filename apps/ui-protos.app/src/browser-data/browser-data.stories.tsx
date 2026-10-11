import type { Meta, StoryObj } from "@storybook/react-vite";
import { BrowserData } from "./browser-data.js";
import { MB } from "./storage.js";

const meta = {
  title: "Prototypes/Data kept in this browser",
  component: BrowserData,
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
    persist: { control: "inline-radio", options: ["not-asked", "granted", "denied"] },
  },
} satisfies Meta<typeof BrowserData>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NotProtected: Story = {
  name: "Not protected yet (the browser will say yes)",
  args: { persist: "not-asked", browserAnswers: true },
};

export const BrowserSaysNo: Story = {
  name: "The browser says no",
  args: { persist: "not-asked", browserAnswers: false },
};

export const Protected: Story = {
  name: "Protected",
  args: { persist: "granted" },
};

export const NearlyFull: Story = {
  name: "Nearly full",
  args: { persist: "denied", quota: 400 * MB },
};
