import { Card } from "@statewalker/ui.view.shadcn";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { dupontBudget, dupontStart, leroyTimber } from "../ask/answers.js";
import { AnswerWithHow, HowAnswered } from "./how-answered.js";

const meta = {
  title: "Prototypes/Ask — how it was answered",
  component: HowAnswered,
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
  render: (args) => (
    <Card className="w-full max-w-2xl gap-3 p-4">
      <HowAnswered {...args} />
    </Card>
  ),
  args: { answer: dupontStart },
} satisfies Meta<typeof HowAnswered>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FromAnswer: Story = {
  name: "Opened from the answer",
  render: (args) => <AnswerWithHow answer={args.answer} variant={args.variant} />,
};

export const Timeline: Story = {
  name: "A — Step timeline",
  args: { variant: "timeline" },
};

export const Funnel: Story = {
  name: "B — Funnel",
  args: { variant: "funnel" },
};

export const WithScores: Story = {
  name: "A — With scores shown",
  args: { variant: "timeline", scores: true },
};

export const Partial: Story = {
  name: "Partly answered",
  args: { variant: "timeline", answer: dupontBudget },
};

export const NotFound: Story = {
  name: "Not found: nothing good enough",
  args: { variant: "timeline", answer: leroyTimber },
};

export const NotFoundFunnel: Story = {
  name: "B — Funnel, not found",
  args: { variant: "funnel", answer: leroyTimber },
};
