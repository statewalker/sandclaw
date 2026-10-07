import type { Meta, StoryObj } from "@storybook/react-vite";
import { JoinCard, JoinExplainer } from "./join-invite.js";

const meta = {
  title: "Prototypes/Join from invite",
  parameters: { layout: "centered" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Card: Story = {
  name: "A — Single card",
  render: () => <JoinCard />,
};

export const CardConnecting: Story = {
  name: "A — Connecting",
  render: () => <JoinCard state="connecting" />,
};

export const CardFailed: Story = {
  name: "A — Machine offline",
  render: () => <JoinCard state="failed" />,
};

export const Explainer: Story = {
  name: "B — Explain, then join",
  render: () => <JoinExplainer />,
};

export const ExplainerFailed: Story = {
  name: "B — Machine offline",
  render: () => <JoinExplainer state="failed" />,
};
