import { SpecStore } from "@statewalker/render.core";
import { Commands } from "@statewalker/shared-commands";
import { Slots } from "@statewalker/shared-slots";
import { ShowDockPanelCommand } from "@statewalker/shell.core";
import { OpenWikiSiteCommand } from "@statewalker/wiki.core";
import { Workspace } from "@statewalker/workspace.core";
import { describe, expect, it } from "vitest";
import { wikiSiteSpecId } from "./catalog.js";
import initWikiReact from "./init.js";

describe("initWikiReact — wiki:open-site", () => {
  it("creates the site spec and shows a panel; re-opening reuses the same panel", async () => {
    const ws = new Workspace();
    ws.setAdapter(SpecStore, () => new SpecStore());
    ws.setAdapter(Slots, () => new Slots());
    const commands = ws.requireAdapter(Commands);
    const store = ws.requireAdapter(SpecStore);

    const shown: string[] = [];
    commands.listen(ShowDockPanelCommand, (command) => {
      shown.push(command.payload.panelId);
      command.resolve();
      return true;
    });

    const cleanup = initWikiReact({ "workspace:workspace": ws });

    await commands.call(OpenWikiSiteCommand, { project: "proj", slug: "themes" }).promise;
    expect(store.get(wikiSiteSpecId("proj", "themes"))).toBeTruthy();
    expect(shown).toEqual(["wiki-site:proj/themes"]);

    // Re-opening the same site does not duplicate the spec (the guard prevents a
    // throwing re-create) and targets the same deterministic panel id (focus).
    await commands.call(OpenWikiSiteCommand, { project: "proj", slug: "themes" }).promise;
    expect(shown).toEqual(["wiki-site:proj/themes", "wiki-site:proj/themes"]);

    await cleanup();
  });
});
