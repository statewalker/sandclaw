// Mock contents of the files the viewers open. Nothing is parsed: a PDF or DOCX
// is a list of text blocks laid out as pages, an XLSX a few small sheets, an
// image a drawing. The DOCX reuses the passages Ask cites, so a citation opened
// from an answer lands on the same text.

import { documents, dupontStart } from "../ask/answers.js";

/** A paragraph-level piece of a document; citations point at its `id`. */
export interface DocBlock {
  id: string;
  kind: "title" | "heading" | "text" | "signature";
  text: string;
}

export interface Sheet {
  name: string;
  /** First row is the header. */
  rows: (string | number)[][];
}

export type ViewerFile =
  | { kind: "pdf"; path: string; size: string; pages: DocBlock[][] }
  | { kind: "docx"; path: string; size: string; blocks: DocBlock[] }
  | { kind: "xlsx"; path: string; size: string; sheets: Sheet[] }
  | { kind: "image"; path: string; size: string; width: number; height: number }
  | { kind: "unsupported"; path: string; size: string };

/** Opened from an answer: which question cited the file, and which passage. */
export interface Citation {
  question: string;
  blockId: string;
}

const offerPath = "Clients/Dupont — offer.docx";

const offer: DocBlock[] = [
  { id: "o0", kind: "title", text: "Renovation offer — Mr and Mrs Dupont" },
  ...(documents[offerPath] ?? []).flatMap((b): DocBlock[] => [
    ...(b.heading ? [{ id: `${b.blockId}h`, kind: "heading" as const, text: b.heading }] : []),
    { id: b.blockId, kind: "text", text: b.text },
  ]),
  { id: "o6", kind: "text", text: "Offer valid for 30 days. Atelier Morel, Lyon." },
];

const contract: DocBlock[][] = [
  [
    { id: "c1", kind: "title", text: "Works contract" },
    {
      id: "c2",
      kind: "text",
      text: "Between Atelier Morel, 8 quai Saint-Vincent, Lyon (the contractor), and Mr and Mrs Dupont, 14 rue des Tanneurs, Lyon (the client).",
    },
    { id: "c3", kind: "heading", text: "Article 1 — Object" },
    {
      id: "c4",
      kind: "text",
      text: "The contractor renovates the kitchen and the living room floor as described in the offer of 18 September 2026.",
    },
    { id: "c5", kind: "heading", text: "Article 2 — Dates" },
    {
      id: "c6",
      kind: "text",
      text: "The works start on Monday 2 November 2026 and last six weeks, weather and supplies permitting.",
    },
  ],
  [
    { id: "c7", kind: "heading", text: "Article 3 — Price and payment" },
    {
      id: "c8",
      kind: "text",
      text: "The price is €18,400 excluding VAT. 30% is paid on signature, the balance on completion, within 15 days of the invoice.",
    },
    { id: "c9", kind: "heading", text: "Article 4 — Insurance" },
    {
      id: "c10",
      kind: "text",
      text: "The contractor holds a ten-year liability insurance with Mutuelle du Bâtiment, policy 44-0921.",
    },
  ],
  [
    { id: "c11", kind: "heading", text: "Signatures" },
    { id: "c12", kind: "text", text: "Signed in Lyon, on 25 September 2026, in two copies." },
    { id: "c13", kind: "signature", text: "Claire Morel, for Atelier Morel" },
    { id: "c14", kind: "signature", text: "Jean Dupont" },
  ],
];

const q3: Sheet[] = [
  {
    name: "Summary",
    rows: [
      ["Month", "Invoiced", "Paid", "Expenses", "Margin"],
      ["July", 21400, 19800, 12650, 8750],
      ["August", 9600, 11200, 6100, 3500],
      ["September", 27300, 18450, 15980, 11320],
      ["Total", 58300, 49450, 34730, 23570],
    ],
  },
  {
    name: "Invoices",
    rows: [
      ["Number", "Client", "Date", "Amount", "Status", "Paid on", "Notes"],
      ["INV-0405", "Leroy", "2026-07-04", 8400, "Paid", "2026-07-20", "Roof, first half"],
      ["INV-0406", "Martin", "2026-07-11", 5200, "Paid", "2026-07-30", "Bathroom"],
      ["INV-0407", "Leroy", "2026-07-29", 7800, "Paid", "2026-08-12", "Roof, balance"],
      ["INV-0408", "Garnier", "2026-08-08", 3400, "Paid", "2026-08-22", "Windows"],
      ["INV-0409", "Petit", "2026-08-26", 6200, "Paid", "2026-09-10", "Terrace"],
      ["INV-0410", "Martin", "2026-09-05", 9100, "Paid", "2026-09-19", "Kitchen"],
      ["INV-0411", "Bernard", "2026-09-17", 12650, "Waiting", "", "Extension, phase 1"],
      ["INV-0412", "Dupont", "2026-09-25", 5550, "Waiting", "", "30% on signature"],
    ],
  },
  {
    name: "Expenses",
    rows: [
      ["Date", "Supplier", "What", "Amount"],
      ["2026-07-02", "Bois Lyonnais", "Roof timber", 6400],
      ["2026-07-18", "Point P", "Tiles and cement", 2150],
      ["2026-08-03", "Leroy Merlin", "Tools", 890],
      ["2026-09-12", "Bois Lyonnais", "Oak flooring", 9200],
    ],
  },
];

/** Every file the stories open, by path. */
export const viewerFiles: Record<string, ViewerFile> = {
  "Clients/contracts/Dupont — signed.pdf": {
    kind: "pdf",
    path: "Clients/contracts/Dupont — signed.pdf",
    size: "212 KB",
    pages: contract,
  },
  [offerPath]: { kind: "docx", path: offerPath, size: "84 KB", blocks: offer },
  "Finance/2026-Q3.xlsx": { kind: "xlsx", path: "Finance/2026-Q3.xlsx", size: "31 KB", sheets: q3 },
  "Photos/Dupont kitchen — before.jpg": {
    kind: "image",
    path: "Photos/Dupont kitchen — before.jpg",
    size: "2.1 MB",
    width: 1600,
    height: 1200,
  },
  "Plans/Dupont kitchen.dwg": {
    kind: "unsupported",
    path: "Plans/Dupont kitchen.dwg",
    size: "4.8 MB",
  },
};

/** The offer, as Ask's “When does the Dupont job start?” cites it (source 2). */
export const offerCitation: Citation = {
  question: dupontStart.question,
  blockId: dupontStart.sources.find((s) => s.path === offerPath)?.blockId ?? "o3",
};

/** The signed contract, cited for the same question. */
export const contractCitation: Citation = { question: dupontStart.question, blockId: "c6" };

export const notePath = "Notes/meeting 2026-10-02.md";

/** The note the editor stories open. */
export const noteText = `# Meeting with Dupont

2 October, at the house. Present: Mr and Mrs Dupont, Claire, Hugo.

Mr Dupont agreed to start the works on **Monday 2 November**, once the kitchen is emptied.
Mrs Dupont wants to keep the *oak beams* in the living room visible.

## Follow-ups

- [ ] Send Dupont the revised phase 1 schedule
- [ ] Ask [Bois Lyonnais](https://example.com/bois-lyonnais) for the beam quote
- [x] Share the visit photos with Hugo

## Budget so far

| Item | Amount |
| --- | --- |
| Kitchen | €9,800 |
| Floor | €8,600 |
`;

/** The same note, as another program saved it meanwhile (Hugo's phone, through a sync app). */
export const noteTheirs = noteText
  .replace("- [ ] Send Dupont", "- [x] Send Dupont")
  .replace(
    "- [x] Share the visit photos with Hugo",
    "- [x] Share the visit photos with Hugo\n- [ ] Order the tiles",
  );

/** The line Ask cites in the note ("Mr Dupont agreed to start…"). */
export const noteCitation = { question: dupontStart.question, line: 4 };
