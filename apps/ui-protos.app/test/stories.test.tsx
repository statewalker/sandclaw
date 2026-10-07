import { composeStories } from "@storybook/react-vite";
import { cleanup, render } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, expect, it } from "vitest";
import * as assistant from "../src/assistant-panel/assistant-panel.stories.js";
import * as invite from "../src/invite-colleague/invite-colleague.stories.js";
import * as join from "../src/join-invite/join-invite.stories.js";
import * as link from "../src/link-status/link-status.stories.js";
import * as workspace from "../src/workspace-layout/workspace-layout.stories.js";

afterEach(cleanup);

// Every story must render: a broken prototype otherwise only shows up as a red
// box in the published site.
const stories: [string, ComponentType][] = [
  ...Object.entries(composeStories(assistant)),
  ...Object.entries(composeStories(invite)),
  ...Object.entries(composeStories(join)),
  ...Object.entries(composeStories(link)),
  ...Object.entries(composeStories(workspace)),
];

it.each(stories)("%s renders", (_, Story) => {
  render(<Story />);
  expect(document.body.textContent?.trim()).not.toBe("");
});
