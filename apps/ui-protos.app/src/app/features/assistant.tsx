import { Lightbulb, MessagesSquare, Sparkles } from "lucide-react";
import { AgentTools } from "../../agent-tools/agent-tools.js";
import { AiModels } from "../../ai-models/ai-models.js";
import { dupontStart } from "../../ask/answers.js";
import { AssistantPanel } from "../../assistant-panel/assistant-panel.js";
import { Connectors } from "../../connectors/connectors.js";
import { ConversationsSidebar } from "../../conversations/conversations.js";
import { AnswerWithHow } from "../../explore/how-answered.js";
import { appViewsSlot, menuItem, menuItemsSlot, OpenSettings, ShowPanel } from "../contracts.js";
import { all, type Feature, provideAll, registerAll, settingsTab } from "../runtime.js";
import { PanelPage } from "../shell/panel-page.js";

export const assistant: Feature = {
  id: "assistant",
  label: "Assistant",
  contribute: (rt, ctx) =>
    all(
      registerAll(rt.slots, appViewsSlot, [
        {
          id: "assistant",
          title: "Assistant",
          Icon: Sparkles,
          zone: "right",
          mobile: "tab",
          render: () => <AssistantPanel scenario="deck" />,
        },
        {
          id: "conversations",
          title: "Conversations",
          Icon: MessagesSquare,
          zone: "center",
          mobile: "more",
          render: () => <ConversationsSidebar fill />,
        },
        {
          id: "how-answered",
          title: "How it was answered",
          Icon: Lightbulb,
          zone: "center",
          render: () => (
            <PanelPage>
              <AnswerWithHow answer={dupontStart} />
            </PanelPage>
          ),
        },
      ]),
      provideAll(rt.slots, menuItemsSlot, [
        menuItem(
          ShowPanel,
          { id: "assistant" },
          {
            id: "assistant.panel",
            menu: "Assistant",
            order: 10,
            label: "Assistant",
            Icon: Sparkles,
          },
        ),
        menuItem(
          ShowPanel,
          { id: "conversations" },
          {
            id: "assistant.conversations",
            menu: "Assistant",
            order: 20,
            label: "Conversations",
            Icon: MessagesSquare,
          },
        ),
        menuItem(
          ShowPanel,
          { id: "how-answered" },
          {
            id: "assistant.how",
            menu: "Assistant",
            order: 30,
            label: "How it was answered",
            Icon: Lightbulb,
          },
        ),
        menuItem(
          OpenSettings,
          { section: "agent-tools" },
          { id: "assistant.tools", menu: "Assistant", order: 40, label: "Agent tools…" },
        ),
        menuItem(
          OpenSettings,
          { section: "connectors" },
          { id: "assistant.connectors", menu: "Assistant", order: 50, label: "Connectors…" },
        ),
        ...(ctx.viewer === "admin"
          ? [
              menuItem(
                OpenSettings,
                { section: "ai-models" },
                { id: "assistant.models", menu: "Assistant", order: 60, label: "AI models…" },
              ),
            ]
          : []),
        menuItem(
          ShowPanel,
          { id: "assistant" },
          { id: "view.assistant", menu: "View", order: 50, label: "Assistant", Icon: Sparkles },
        ),
      ]),
      settingsTab(rt.slots, "connectors", 40, () => <Connectors variant="list" />),
      settingsTab(rt.slots, "agent-tools", 50, () => <AgentTools variant="groups" />),
      ctx.viewer === "admin"
        ? settingsTab(rt.slots, "ai-models", 110, () => <AiModels variant="one-page" />)
        : () => {},
    ),
};
