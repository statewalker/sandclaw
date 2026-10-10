import type { Meta, StoryObj } from "@storybook/react-vite";
import { macMini } from "./install-steps.js";
import { Installer } from "./installer.js";

const meta = {
  title: "Prototypes/Machine installer",
  component: Installer,
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
    variant: { control: "inline-radio", options: ["steps", "single-page"] },
    step: {
      control: "select",
      options: ["check", "models", "names", "download", "start", "invite"],
    },
  },
} satisfies Meta<typeof Installer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Check: Story = {
  name: "A — 1. Check this Mac",
  args: { variant: "steps", step: "check" },
};

export const Models: Story = {
  name: "A — 2. Choose the models",
  args: { variant: "steps", step: "models" },
};

export const Names: Story = {
  name: "A — 3. Name the group",
  args: { variant: "steps", step: "names" },
};

export const Download: Story = {
  name: "A — 4. Download (in progress)",
  args: { variant: "steps", step: "download", downloadedGB: 2.6 },
};

export const Start: Story = {
  name: "A — 5. Start and test (in progress)",
  args: { variant: "steps", step: "start", tests: { runtime: "ok", "llm-api": "running" } },
};

export const Invite: Story = {
  name: "A — 6. The first admin invite",
  args: { variant: "steps", step: "invite" },
};

export const NoDocker: Story = {
  name: "Missing: Docker not installed (Check again fixes it)",
  args: {
    step: "check",
    facts: { ...macMini, dockerInstalled: false, dockerRunning: false },
    factsAfterCheck: macMini,
  },
};

export const DockerStopped: Story = {
  name: "Missing: Docker not running, small Mac",
  args: {
    step: "check",
    facts: { ...macMini, dockerRunning: false, memoryGB: 8, freeDiskGB: 40 },
    factsAfterCheck: { ...macMini, memoryGB: 8, freeDiskGB: 40 },
  },
};

export const Resumed: Story = {
  name: "Resumed after a restart",
  args: { done: ["check", "models", "names"], resumed: true, downloadedGB: 3.4 },
};

export const TestFailed: Story = {
  name: "Failed: a service test (Retry passes)",
  args: {
    step: "start",
    tests: { runtime: "ok", "llm-api": "failed" },
    failingService: "llm-api",
  },
};

export const SinglePage: Story = {
  name: "B — One page, sections open in turn",
  args: { variant: "single-page", step: "check" },
};

export const SinglePageLater: Story = {
  name: "B — One page, downloading",
  args: { variant: "single-page", step: "download", downloadedGB: 5.1 },
};
