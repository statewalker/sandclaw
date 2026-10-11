import "../src/index.css";
import { withThemeByClassName } from "@storybook/addon-themes";
import type { Preview } from "@storybook/react-vite";

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    options: {
      storySort: {
        order: [
          "Welcome",
          "Workspace",
          "Files",
          "Notes and todos",
          "Chats",
          "Agents",
          "Indexing and search",
          "Sites",
          "Mesh",
          ["Set up", "Join", "Manage"],
        ],
      },
    },
  },
  decorators: [
    withThemeByClassName({
      themes: { light: "", dark: "dark" },
      defaultTheme: "light",
    }),
  ],
};

export default preview;
