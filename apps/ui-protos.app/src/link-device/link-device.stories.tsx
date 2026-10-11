import type { Meta, StoryObj } from "@storybook/react-vite";
import { comparePair, failedPair } from "./flow.js";
import { LinkDevices } from "./link-device.js";

const meta = {
  title: "Prototypes/Link a device",
  component: LinkDevices,
  parameters: { layout: "fullscreen" },
  argTypes: {
    linkCase: { control: "inline-radio", options: ["add", "merge"] },
    codeCheck: { control: "inline-radio", options: ["compare", "type"] },
  },
} satisfies Meta<typeof LinkDevices>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AddCompare: Story = {
  name: "A — Add a phone, compare the code",
  args: { linkCase: "add", codeCheck: "compare" },
};

export const AddType: Story = {
  name: "B — Add a phone, type the code",
  args: { linkCase: "add", codeCheck: "type" },
};

export const Merge: Story = {
  name: "Merge: Hugo B. becomes Hugo Benali",
  args: { linkCase: "merge", codeCheck: "compare" },
};

export const MergeAtCompare: Story = {
  name: "Merge: the compare step",
  args: { linkCase: "merge", start: comparePair("merge") },
};

export const Expired: Story = {
  name: "Failed: link expired (wait 8 s)",
  args: { windowMs: 8000 },
};

export const Taken: Story = {
  name: "Failed: a second device tried (play it)",
  args: { fail: "taken" },
};

export const TakenResult: Story = {
  name: "Failed: a second device tried",
  args: { start: failedPair("taken") },
};

export const Declined: Story = {
  name: "Failed: the codes differ (play it)",
  args: { fail: "declined" },
};

export const DeclinedTyped: Story = {
  name: "Failed: the codes differ, typed (play it)",
  args: { fail: "declined", codeCheck: "type" },
};

export const TimedOut: Story = {
  name: "Failed: no confirmation in time (wait 6 s at the code)",
  args: { linkCase: "add", start: comparePair("add"), confirmMs: 6000 },
};

export const OtherSideLeft: Story = {
  name: "Failed: the other device left",
  args: { start: failedPair("other-side-left") },
};
