import type { Meta, StoryObj } from "@storybook/react-vite";
import { modeFor } from "../workspace-layout/responsive.js";
import { App, type AppProps, allFeatures } from "./app.js";

const WIDTHS = { desktop: undefined, tablet: 820, phone: 390 } as const;
type Frame = keyof typeof WIDTHS;

/** The App in a frame of the chosen width; the App picks its mode from its own width. */
function AppFrame({ frame = "desktop", ...props }: Omit<AppProps, "runtime"> & { frame?: Frame }) {
  const width = WIDTHS[frame];
  return (
    <div className="mx-auto h-svh border-x" style={{ width: width ?? "100%" }}>
      <App {...props} initialMode={width ? modeFor(width) : "desktop"} />
    </div>
  );
}

const meta = {
  title: "App/Sandclaw",
  component: AppFrame,
  parameters: { layout: "fullscreen" },
  argTypes: {
    frame: { control: "inline-radio", options: Object.keys(WIDTHS) },
    viewer: { control: "inline-radio", options: ["admin", "member"] },
    features: {
      control: "check",
      options: allFeatures.map((f) => f.id),
    },
  },
  args: { frame: "desktop", viewer: "admin", features: allFeatures.map((f) => f.id) },
} satisfies Meta<typeof AppFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = { name: "Desktop" };
export const Tablet: Story = { name: "Tablet (820 px)", args: { frame: "tablet" } };
export const Phone: Story = { name: "Phone (390 px)", args: { frame: "phone" } };
export const MemberViewer: Story = { name: "A member (Hugo)", args: { viewer: "member" } };
export const FeaturesOff: Story = {
  name: "Features switched off (no Sites, no Indexing)",
  args: {
    features: allFeatures.map((f) => f.id).filter((id) => id !== "sites" && id !== "indexing"),
  },
};
