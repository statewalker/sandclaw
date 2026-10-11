import type { Meta, StoryObj } from "@storybook/react-vite";
import { catalog, connectors, newConnector } from "./connector-model.js";
import { Connectors } from "./connectors.js";

const meta = {
  title: "Prototypes/Connectors",
  component: Connectors,
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
} satisfies Meta<typeof Connectors>;

export default meta;
type Story = StoryObj<typeof meta>;

const [mail] = connectors;

export const List: Story = {
  name: "A — List with a page per connector",
  args: { variant: "list" },
};

export const ListPage: Story = {
  name: "A — Mail's page",
  args: { variant: "list", open: "mail" },
};

export const Cards: Story = {
  name: "B — Cards, capabilities in place",
  args: { variant: "cards" },
};

export const Empty: Story = {
  name: "No connectors yet",
  args: { variant: "cards", connectors: [] },
};

export const Add: Story = {
  name: "Add a connector",
  args: { variant: "cards", connectors: [], adding: true },
};

export const AddByAddress: Story = {
  name: "Add: MCP server by address, a mistake",
  args: { variant: "cards", adding: "advanced", address: "http://tickets.atelier-morel.fr/mcp" },
};

export const Connecting: Story = {
  name: "Connecting: waiting for the popup",
  args: {
    variant: "cards",
    connectors: [{ ...newConnector(catalog[0] as (typeof catalog)[number]), connecting: true }],
    // The popup is not prototyped: the sign-in never completes here.
    signIn: () => new Promise(() => {}),
  },
};

export const Expired: Story = {
  name: "Sign-in expired",
  args: { variant: "list", open: "calendar" },
};

export const Down: Story = {
  name: "The service is not answering",
  args: { variant: "list", open: "drive" },
};

export const Revoke: Story = {
  name: "Revoke: confirmation",
  args: { variant: "cards", connectors: mail ? [mail] : [], revoking: "mail" },
};
