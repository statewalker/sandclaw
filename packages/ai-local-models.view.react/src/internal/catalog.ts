import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react";
import { shadcnComponentDefinitions } from "@json-render/shadcn/catalog";
import { z } from "zod";

/**
 * json-render catalog for the Local Models settings tab. Re-exports the
 * prebuilt shadcn component definitions and adds the bespoke `Markdown`
 * primitive used by the per-model detail pane. The action set covers
 * exactly the four local-model writes the tab needs.
 */
export const aiLocalModelsCatalog = defineCatalog(schema, {
  components: {
    ...shadcnComponentDefinitions,
    Markdown: {
      props: z.object({ source: z.string() }),
      description: "Rendered markdown text (formatted lists, headings, etc.)",
    },
  },
  actions: {
    downloadLocalModel: {
      params: z.object({ key: z.string() }),
      description: "Start downloading a local model's weights.",
    },
    cancelDownload: {
      params: z.object({ key: z.string() }),
      description: "Abort an in-progress local-model download.",
    },
    removeLocalModel: {
      params: z.object({ key: z.string() }),
      description: "Delete on-disk weights for a local model.",
    },
    selectLocalModel: {
      params: z.object({ key: z.string() }),
      description: "Make a downloaded local model the active selection.",
    },
  },
});

export type AiLocalModelsCatalog = typeof aiLocalModelsCatalog;
