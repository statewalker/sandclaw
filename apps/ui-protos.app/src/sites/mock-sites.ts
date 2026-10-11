// The sites on Claire's laptop. Content is invented; it only needs to read like
// pages the assistant wrote from the Atelier Morel folder, every fact cited.

import { today } from "../mock.js";
import type { Site, SitePage } from "./site-model.js";

const daysAgo = (days: number) => new Date(today.getTime() - days * 24 * 60 * 60 * 1000);

const done = (id: string, title: string, extra: Partial<SitePage> = {}): SitePage => ({
  id,
  title,
  state: "done",
  ...extra,
});

export const dupont: Site = {
  id: "site-dupont",
  name: "Dupont renovation",
  source: { kind: "folder", path: "Clients" },
  builtAt: daysAgo(4),
  changedFiles: [
    "Clients/Dupont — notes.md",
    "Clients/contracts/Dupont — signed.pdf",
    "Notes/meeting 2026-10-02.md",
  ],
  pages: [
    done("dupont-overview", "Overview", {
      body: [
        [
          {
            text: "The Dupont family is renovating a former carpentry workshop in Lyon into a two-storey home.",
            cites: [1],
          },
          {
            text: "Atelier Morel handles the design and follows the works on site.",
            cites: [1, 2],
          },
        ],
        [
          {
            text: "The offer was signed on 18 September, for phase 1 (structure and roof) only.",
            cites: [2],
          },
          {
            text: "Phase 2, the interior, will be quoted once the beams are in place.",
            cites: [3],
          },
        ],
      ],
      sources: [
        { n: 1, path: "Clients/Dupont — offer.docx", section: "The project" },
        { n: 2, path: "Clients/contracts/Dupont — signed.pdf", section: "Signatures" },
        { n: 3, path: "Notes/meeting 2026-10-02.md", section: "Follow-ups" },
      ],
      figure: {
        caption: "The workshop before the works, from the first site visit.",
        path: "Clients/Dupont — site visit.jpg",
      },
    }),
    done("dupont-offer", "The offer", {
      body: [
        [
          { text: "Phase 1 is priced at €48,600 excluding VAT.", cites: [1] },
          {
            text: "The largest item is the oak beams from Bois Lyonnais, still to be confirmed.",
            cites: [1, 2],
          },
        ],
      ],
      sources: [
        { n: 1, path: "Clients/Dupont — offer.docx", section: "Prices" },
        { n: 2, path: "Notes/meeting 2026-10-02.md", section: "Follow-ups" },
      ],
    }),
    done("dupont-schedule", "Schedule"),
    done("dupont-contract", "Contract and payments"),
    done("dupont-open", "Open questions"),
  ],
};

export const howWeWork: Site = {
  id: "site-how",
  name: "How we work",
  source: { kind: "topics" },
  builtAt: daysAgo(12),
  changedFiles: [],
  pages: [
    done("how-pricing", "How we price a renovation"),
    done("how-suppliers", "Our suppliers"),
    { id: "how-visits", title: "Site visits", state: "writing" },
    { id: "how-invoicing", title: "Invoicing and payments", state: "waiting" },
    { id: "how-clients", title: "Working with clients", state: "waiting" },
    { id: "how-insurance", title: "Insurance and contracts", state: "waiting" },
    { id: "how-tools", title: "Tools and software", state: "waiting" },
    { id: "how-team", title: "Who does what", state: "waiting" },
  ],
};

export const finance: Site = {
  id: "site-finance",
  name: "Finance 2026",
  source: { kind: "folder", path: "Finance" },
  builtAt: daysAgo(1),
  changedFiles: [],
  pages: [
    done("fin-overview", "Finance: overview"),
    done("fin-q3", "Third quarter"),
    {
      id: "fin-invoices",
      title: "Invoices",
      state: "failed",
      reason: "The AI model didn't answer",
    },
    {
      id: "fin-q2",
      title: "Second quarter",
      state: "failed",
      reason: "No source files left for this section",
    },
    done("fin-suppliers", "Payments to suppliers"),
  ],
};

export const leroy: Site = {
  id: "site-leroy",
  name: "Leroy extension",
  source: { kind: "folder", path: "Clients" },
  builtAt: daysAgo(0),
  changedFiles: [],
  pages: [
    done("leroy-brief", "The brief"),
    done("leroy-budget", "Budget"),
    done("leroy-next", "Next steps"),
  ],
};

export const sites: Site[] = [dupont, howWeWork, finance, leroy];

/** What a default site starts from: the topics Ask extracted from the folder. */
export const topics = [
  "How we price a renovation",
  "Our suppliers",
  "Site visits",
  "Invoicing and payments",
  "Working with clients",
  "Insurance and contracts",
];

/** Pages the scripted generator fails on, with the reason it gives. */
export const scriptedFailures: Record<string, string> = {
  "how-tools": "No source files left for this section",
};
