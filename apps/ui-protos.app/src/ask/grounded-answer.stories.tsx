import type { Meta, StoryObj } from "@storybook/react-vite";
import { dupontBudget, dupontStart, leroyTimber } from "./answers.js";
import { AskChat, AskPanel } from "./grounded-answer.js";

const meta = {
  title: "Prototypes/Ask — grounded answer",
  component: AskPanel,
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
  args: { question: dupontStart.question, freeze: "done" },
} satisfies Meta<typeof AskPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Inline: Story = {
  name: "A — Citations inline, source cards below",
  args: { layout: "inline" },
};

export const Side: Story = {
  name: "B — Sources in a side list",
  args: { layout: "side" },
};

export const Live: Story = {
  name: "Answering, played through",
  args: { layout: "inline", freeze: undefined },
};

export const Searching: Story = {
  name: "Answering: searching your files",
  args: { freeze: "searching" },
};

export const Writing: Story = {
  name: "Answering: writing the answer",
  args: { freeze: "writing" },
};

export const NotFound: Story = {
  name: "Not found in your files",
  args: { question: leroyTimber.question },
};

export const Partial: Story = {
  name: "Partly answered",
  args: { question: dupontBudget.question },
};

export const InChat: Story = {
  name: "In chat — the ask tool",
  args: { question: dupontStart.question },
  render: (args) => <AskChat startWith={args.question} delay={args.delay} />,
};

export const InChatHistory: Story = {
  name: "In chat — earlier questions",
  args: { question: dupontStart.question },
  render: (args) => <AskChat history={[args.question, dupontBudget.question]} delay={args.delay} />,
};
