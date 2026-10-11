import type { Toc, Topic } from "./toc-model.js";

/** What Ask's indexing found in the Dupont files, with how many documents each covers. */
export const topics: Topic[] = [
  { id: "t_wishes", name: "Client wishes", docs: 4, theme: "The brief" },
  { id: "t_kitchen", name: "Kitchen works", docs: 14, theme: "The works" },
  { id: "t_beams", name: "Oak beams", docs: 6, theme: "The works" },
  { id: "t_bathroom", name: "Bathroom", docs: 5, theme: "The works" },
  { id: "t_schedule", name: "Schedule", docs: 9, theme: "Schedule" },
  { id: "t_visits", name: "Site visits", docs: 7, theme: "Schedule" },
  { id: "t_budget", name: "Budget", docs: 11, theme: "Budget" },
  { id: "t_invoices", name: "Invoices", docs: 8, theme: "Budget" },
  { id: "t_suppliers", name: "Suppliers", docs: 5, theme: "Suppliers" },
];

const topic = (id: string) => ({ kind: "topic" as const, id });
const file = (path: string) => ({ kind: "file" as const, path });

const overview = {
  id: "s_overview",
  title: "Overview",
  sources: [file("Clients/Dupont — offer.docx"), topic("t_wishes")],
  children: [],
};
const kitchen = { id: "s_kitchen", title: "Kitchen", sources: [topic("t_kitchen")], children: [] };
const beams = { id: "s_beams", title: "Oak beams", sources: [topic("t_beams")], children: [] };
const works = {
  id: "s_works",
  title: "The works",
  sources: [topic("t_kitchen"), topic("t_beams")],
  children: [kitchen, beams],
};
const schedule = {
  id: "s_schedule",
  title: "Schedule",
  sources: [topic("t_schedule"), file("Notes/meeting 2026-10-02.md")],
  children: [],
};
const budget = {
  id: "s_budget",
  title: "Budget",
  sources: [topic("t_budget"), file("Finance/2026-Q3.xlsx")],
  children: [],
};

/** The "Dupont renovation" site as last saved; "Photos" has nothing to write from. */
export const dupontToc: Toc = [
  overview,
  works,
  schedule,
  budget,
  { id: "s_photos", title: "Photos", sources: [], children: [] },
];

/**
 * The same site after a few edits, not saved yet: "Kitchen" renamed, the invoices
 * added to "Budget", "Photos" removed, "Suppliers" added, "Schedule" moved up.
 */
export const editedDupontToc: Toc = [
  overview,
  schedule,
  { ...works, children: [{ ...kitchen, title: "Kitchen and dining" }, beams] },
  { ...budget, sources: [...budget.sources, topic("t_invoices")] },
  { id: "s_suppliers", title: "Suppliers", sources: [topic("t_suppliers")], children: [] },
];
