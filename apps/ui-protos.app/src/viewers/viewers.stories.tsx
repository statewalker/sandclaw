import type { Meta, StoryObj } from "@storybook/react-vite";
import { contractCitation, offerCitation } from "./files.js";
import { FileViewer } from "./viewers.js";

const meta = {
  title: "Prototypes/Viewers",
  component: FileViewer,
  parameters: { layout: "fullscreen" },
  // Centred by a grid, not by Storybook's "centered" layout: that one sizes the
  // story to its content, so a phone-width viewport scrolls sideways.
  decorators: [
    (Story) => (
      <div className="grid min-h-svh grid-cols-[minmax(0,1fr)] place-items-center p-4">
        <div className="h-[36rem] w-full max-w-4xl overflow-hidden rounded-lg border">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof FileViewer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pdf: Story = {
  name: "PDF — pages and zoom",
  args: { path: "Clients/contracts/Dupont — signed.pdf" },
};

export const Docx: Story = {
  name: "DOCX — a document page",
  args: { path: "Clients/Dupont — offer.docx" },
};

export const Xlsx: Story = {
  name: "XLSX — grid and sheet tabs",
  args: { path: "Finance/2026-Q3.xlsx" },
};

export const Image: Story = {
  name: "Image — fit and zoom",
  args: { path: "Photos/Dupont kitchen — before.jpg" },
};

export const CitedDocx: Story = {
  name: "Cited: opened from an answer (DOCX)",
  args: { path: "Clients/Dupont — offer.docx", citation: offerCitation },
};

export const CitedPdf: Story = {
  name: "Cited: opened from an answer (PDF)",
  args: { path: "Clients/contracts/Dupont — signed.pdf", citation: contractCitation },
};

export const Unsupported: Story = {
  name: "Can't show this file type",
  args: { path: "Plans/Dupont kitchen.dwg" },
};

export const Loading: Story = {
  name: "A large file, opening",
  args: { path: "Plans/Dupont kitchen.dwg", loading: 42 },
};
