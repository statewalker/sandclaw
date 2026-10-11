import type { Meta, StoryObj } from "@storybook/react-vite";
import { services } from "./endpoints.js";
import { Services } from "./services.js";

const meta = {
  title: "Prototypes/Services",
  component: Services,
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
} satisfies Meta<typeof Services>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Inline: Story = {
  name: "A — Rows that open in place",
  args: { variant: "inline", selected: "llm-api" },
};

export const ListDetail: Story = {
  name: "B — List and detail",
  args: { variant: "list-detail" },
};

export const AddWithMistakes: Story = {
  name: "Add a service: mistakes",
  args: {
    variant: "inline",
    draft: { name: "", path: "paperless", target: "192.168.1.20:8000", access: "everyone" },
  },
};

export const PathTaken: Story = {
  name: "Add a service: address already used",
  args: {
    variant: "list-detail",
    draft: {
      name: "Scanner",
      path: "/Printer/",
      target: "http://192.168.1.32",
      access: "everyone",
    },
  },
};

export const Down: Story = {
  name: "A service is down",
  args: { variant: "list-detail", selected: "printer" },
};

export const AssistantDown: Story = {
  name: "The LLM API is down",
  args: {
    variant: "inline",
    selected: "llm-api",
    services: services.map((s) =>
      s.id === "llm-api"
        ? { ...s, probe: { at: s.probe?.at ?? new Date(), error: "Connection refused" } }
        : s,
    ),
  },
};

export const TurnedOff: Story = {
  name: "A service turned off",
  args: { variant: "inline", selected: "wiki" },
};

export const Testing: Story = {
  name: "Test: running, then its result",
  args: { variant: "list-detail", selected: "paperless", testing: "paperless" },
};

export const Remove: Story = {
  name: "Remove: confirmation",
  args: { variant: "inline", selected: "printer", removing: "printer" },
};
