import type { Meta, StoryObj } from "@storybook/react-vite";
import { ComposerChat } from "./composer.js";
import { findReference, type Reference } from "./references.js";

const ref = (path: string) => findReference(path) as Reference;

const meta = {
  title: "Prototypes/Chat — composer",
  component: ComposerChat,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="grid min-h-svh grid-cols-[minmax(0,1fr)] place-items-center p-4">
        <Story />
      </div>
    ),
  ],
  args: { variant: "A" },
} satisfies Meta<typeof ComposerChat>;

export default meta;
type Story = StoryObj<typeof meta>;

const question = "What does the Dupont offer cover, and is the start date confirmed?";

export const EmptyA: Story = { name: "A — Empty" };

export const EmptyB: Story = { name: "B — Empty", args: { variant: "B" } };

export const WithContextA: Story = {
  name: "A — With context from the folder",
  args: {
    initialRefs: [ref("Clients/Dupont — offer.docx"), ref("Clients")],
    initialText: "Is the start date confirmed?",
  },
};

export const WithContextB: Story = {
  name: "B — With context from the folder",
  args: {
    variant: "B",
    initialRefs: [ref("Clients/Dupont — offer.docx"), ref("Clients")],
    initialText: "Check @Dupont — offer.docx against @Clients/ — is the start date confirmed?",
  },
};

export const MentionA: Story = {
  name: "A — @ mention open",
  args: { initialText: "Compare the offer with @dup" },
};

export const MentionB: Story = {
  name: "B — @ mention open",
  args: { variant: "B", initialText: "Compare the offer with @dup" },
};

export const Running: Story = {
  name: "Running, with a queued message",
  args: {
    delay: 2500,
    startWith: question,
    thenSend: "And the Leroy brief — when is it due?",
  },
};

export const Stopped: Story = {
  name: "Stopped answer",
  args: { stoppedAfter: question },
};

export const Offline: Story = {
  name: "Offline — failed send, Retry",
  args: { online: false, startWith: question },
};

export const OfflineAutoRetry: Story = {
  name: "Offline — sent when the machine is back",
  args: { online: false, autoRetry: true, startWith: question },
};

export const OutsideFile: Story = {
  name: "File from outside the folder",
  args: { initialNotice: { kind: "outside", filename: "budget.xlsx" } },
};
