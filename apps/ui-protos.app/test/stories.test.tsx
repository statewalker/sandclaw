import { composeStories } from "@storybook/react-vite";
import { cleanup, render } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, expect, it } from "vitest";
import * as aiModels from "../src/ai-models/ai-models.stories.js";
import * as groundedAnswer from "../src/ask/grounded-answer.stories.js";
import * as assistant from "../src/assistant-panel/assistant-panel.stories.js";
import * as composer from "../src/composer/composer.stories.js";
import * as conversations from "../src/conversations/conversations.stories.js";
import * as fileManager from "../src/files/file-manager.stories.js";
import * as folderZone from "../src/folder-zone/folder-zone.stories.js";
import * as status from "../src/group-status/group-status.stories.js";
import * as indexing from "../src/indexing/indexing.stories.js";
import * as invitationsLog from "../src/invitations-log/invitations-log.stories.js";
import * as join from "../src/join-invite/join-invite.stories.js";
import * as linkDevice from "../src/link-device/link-device.stories.js";
import * as myIdentity from "../src/my-identity/my-identity.stories.js";
import * as todos from "../src/notes-todos/todos-view.stories.js";
import * as services from "../src/services/services.stories.js";
import * as tasksStrip from "../src/tasks/tasks-strip.stories.js";
import * as team from "../src/team/team.stories.js";
import * as noteEditor from "../src/viewers/note-editor.stories.js";
import * as viewers from "../src/viewers/viewers.stories.js";
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
  ...Object.entries(composeStories(invitationsLog)),
  ...Object.entries(composeStories(linkDevice)),
  ...Object.entries(composeStories(myIdentity)),
  ...Object.entries(composeStories(groundedAnswer)),
  ...Object.entries(composeStories(indexing)),
  ...Object.entries(composeStories(conversations)),
  ...Object.entries(composeStories(composer)),
  ...Object.entries(composeStories(tasksStrip)),
  ...Object.entries(composeStories(services)),
  ...Object.entries(composeStories(aiModels)),
  ...Object.entries(composeStories(fileManager)),
  ...Object.entries(composeStories(viewers)),
  ...Object.entries(composeStories(noteEditor)),
];

it.each(stories)("%s renders", (_, Story) => {
  render(<Story />);
  expect(document.body.textContent?.trim()).not.toBe("");
});
