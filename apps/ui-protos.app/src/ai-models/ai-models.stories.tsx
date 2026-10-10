import type { Meta, StoryObj } from "@storybook/react-vite";
import { today } from "../mock.js";
import { AiModels, LiteLlmAdminPage } from "./ai-models.js";
import { daysAgo, models, usage } from "./usage.js";

const meta = {
  title: "Prototypes/AI models",
  component: AiModels,
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
} satisfies Meta<typeof AiModels>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OnePage: Story = {
  name: "A — One page",
  args: { variant: "one-page" },
};

export const WithTabs: Story = {
  name: "B — Tabs",
  args: { variant: "tabs" },
};

export const SwitchEmbeddings: Story = {
  name: "Switching the search index to a cloud model",
  args: { variant: "one-page", pick: { job: "embeddings", modelId: "openai-embed" } },
};

export const SwitchChatLocal: Story = {
  name: "Switching chat to the hub's model",
  args: { variant: "tabs", pick: { job: "chat", modelId: "llama-8b" } },
};

export const Unreachable: Story = {
  name: "Chat model not answering",
  args: {
    variant: "tabs",
    models: models.map((m) => (m.id === "claude-sonnet" ? { ...m, reachable: false } : m)),
  },
};

export const NoUsage: Story = {
  name: "No usage in the last 7 days",
  args: {
    variant: "tabs",
    tab: "usage",
    period: 7,
    usage: usage.filter((r) => daysAgo(r.day, today) >= 7),
  },
};

export const PersonDevices: Story = {
  name: "Inès's devices",
  args: { variant: "tabs", tab: "usage", open: "pk_ines" },
};

export const ByModel: Story = {
  name: "Usage by model, 90 days",
  args: { variant: "tabs", tab: "usage", groupBy: "model", period: 90 },
};

export const LiteLlmTab: Story = {
  name: "B — LiteLLM admin tab",
  args: { variant: "tabs", tab: "litellm" },
};

export const LiteLlmOwnTab: Story = {
  name: "A — LiteLLM admin in its own browser tab",
  render: () => <LiteLlmAdminPage />,
};
