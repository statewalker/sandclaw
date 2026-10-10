import { composeStories } from "@storybook/react-vite";
import { cleanup, render } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, expect, it } from "vitest";
import * as assistant from "../src/assistant-panel/assistant-panel.stories.js";
import * as folderZone from "../src/folder-zone/folder-zone.stories.js";
import * as status from "../src/group-status/group-status.stories.js";
import * as join from "../src/join-invite/join-invite.stories.js";
import * as todos from "../src/notes-todos/todos-view.stories.js";
import * as team from "../src/team/team.stories.js";
import * as workspace from "../src/workspace-layout/workspace-layout.stories.js";

afterEach(cleanup);

// Every story must render: a broken prototype otherwise only shows up as a red
// box in the published site.
const stories: [string, ComponentType][] = [
  ...Object.entries(composeStories(assistant)),
  ...Object.entries(composeStories(join)),
  ...Object.entries(composeStories(status)),
  ...Object.entries(composeStories(folderZone)),
  ...Object.entries(composeStories(todos)),
  ...Object.entries(composeStories(workspace)),
  ...Object.entries(composeStories(team)),
];

it.each(stories)("%s renders", (_, Story) => {
  render(<Story />);
  expect(document.body.textContent?.trim()).not.toBe("");
});
