import {
  createWiki,
  type LlmWiki,
  registerWikiCommands,
} from "@repo/wiki-runtime/embed";
import { Commands } from "@statewalker/shared-commands";
import { projectRoot } from "./paths";

/**
 * Server-side query runtime. Building an `LlmWiki` opens file-backed stores and
 * resolves the provider/model map, so we do it once per project and reuse the
 * instance across requests. A single `Commands` bus carries the wiki use cases;
 * its handler resolves the right per-project wiki from the dispatched payload's
 * `project`. Everything here is node-only and must never reach a client island.
 */
const wikiCache = new Map<string, Promise<LlmWiki>>();

function getWiki(project: string): Promise<LlmWiki> {
  let pending = wikiCache.get(project);
  if (!pending) {
    pending = createWiki({ root: projectRoot(project) })
      .then((created) => created.wiki)
      .catch((err) => {
        // Don't cache a failed bootstrap — let the next request retry.
        wikiCache.delete(project);
        throw err;
      });
    wikiCache.set(project, pending);
  }
  return pending;
}

let busSingleton: Commands | undefined;

/** The shared command bus, wired to resolve wikis per dispatched `project`. */
export function commands(): Commands {
  if (!busSingleton) {
    busSingleton = Commands.create();
    registerWikiCommands(busSingleton, ({ project }) => {
      if (!project) throw new Error("query-runtime: a 'project' is required");
      return getWiki(project);
    });
  }
  return busSingleton;
}
