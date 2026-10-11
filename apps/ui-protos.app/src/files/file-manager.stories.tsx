import type { Meta, StoryObj } from "@storybook/react-vite";
import { folder } from "../mock.js";
import { FileManager } from "./file-manager.js";

const meta = {
  title: "Prototypes/File management",
  component: FileManager,
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
} satisfies Meta<typeof FileManager>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The folder after the assistant has worked for a while. */
const withOutputs = folder.map((e) =>
  e.name === "Outputs"
    ? {
        ...e,
        children: [
          { name: "contacts.xlsx" },
          { name: "Dupont — summary.md", text: "# Dupont\n" },
          { name: "Q3 figures — chart.png" },
        ],
      }
    : e,
);

export const RowMenu: Story = {
  name: "A — Row menu, rename in place",
  args: { variant: "menu", selected: ["Clients/Dupont — offer.docx"] },
};

export const Toolbar: Story = {
  name: "B — Toolbar on the selection",
  args: {
    variant: "toolbar",
    selected: ["Clients/Dupont — offer.docx", "Clients/Leroy — brief.pdf"],
  },
};

export const RenameError: Story = {
  name: "Rename: the name is taken",
  args: {
    variant: "menu",
    renaming: { path: "Clients/Dupont — offer.docx", draft: "dupont — notes.md" },
  },
};

export const DeleteToTrash: Story = {
  name: "Delete a folder: to Sandclaw’s trash",
  args: { variant: "menu", deleteMode: "trash", selected: ["Clients"], confirmDelete: true },
};

export const DeletePermanent: Story = {
  name: "Delete a folder: for good",
  args: { variant: "menu", deleteMode: "permanent", selected: ["Clients"], confirmDelete: true },
};

export const DragMove: Story = {
  name: "Drag to move: the drop target",
  args: { variant: "menu", dragging: { path: "Clients/Dupont — offer.docx", over: "Finance" } },
};

export const DropImport: Story = {
  name: "Files dropped from the computer: a name clash",
  args: {
    variant: "menu",
    imported: { folder: "Clients", names: ["Dupont — notes.md", "Leroy — plan.pdf"] },
  },
};

export const Outputs: Story = {
  name: "Outputs: what the assistant made",
  args: { variant: "menu", tree: withOutputs, reveal: "Outputs/Dupont — summary.md" },
};

export const Keyboard: Story = {
  name: "Keyboard: F2, Delete, arrows",
  args: { variant: "menu", keyHints: true, selected: ["Notes/todo.md"] },
};

export const KeyboardToolbar: Story = {
  name: "Keyboard (B): Space adds to the selection",
  args: { variant: "toolbar", keyHints: true, selected: ["Notes/todo.md"] },
};

export const Phone: Story = {
  name: "Phone (390 px): no drag, “Move to…”",
  args: { variant: "menu", touch: true },
};
