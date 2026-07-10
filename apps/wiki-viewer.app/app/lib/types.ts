/** A single source reference, e.g. `Foo.pdf#some-section-key`. */
export interface Citation {
  uri: string;
}

export interface Claim {
  text: string;
  citations: Citation[];
}

export interface Topic {
  key: string;
  name: string;
  description?: string;
  citations: Citation[];
}

/** One renderable section — a report answer or a saved/live answer. */
export interface Section {
  /** Stable id, e.g. `01-project-name`. */
  id: string;
  /** Numeric ordering from the filename (`NN`). */
  order: number;
  slug: string;
  /** Display title, e.g. `1. Project Name`. */
  title: string;
  text: string;
  claims: Claim[];
  citations: Citation[];
  topics: Topic[];
  outliers: Topic[];
  suggestions: string[];
}

/** A request to open a source PDF in the full-screen viewer. */
export interface PdfRequest {
  file: string;
  page: number;
  title: string;
}

/** Lightweight citation resolution for the citations list (titles only). */
export interface CitationBrief {
  uri: string;
  found: boolean;
  docTitle?: string;
  sectionTitle?: string;
}

/** A document section that covers a topic/outlier. */
export interface TopicReference {
  uri: string;
  docTitle: string;
  sectionTitle: string;
  sectionSummary: string;
}

/** A topic or outlier with its description and every covering section. */
export interface TopicDetail {
  key: string;
  name: string;
  description: string;
  kind: "topic" | "outlier";
  references: TopicReference[];
}

/** A citation resolved against its source wiki, for the source panel. */
export interface ResolvedCitation {
  uri: string;
  file: string;
  anchor: string;
  /** True when the cited page exists in the resolved wiki. */
  found: boolean;
  docTitle?: string;
  sectionTitle?: string;
  sectionSummary?: string;
  topics?: { key: string; name: string }[];
  /** 1-based PDF page the cited section starts on. */
  page?: number;
  /** True when the original PDF exists under the wiki's `sources/`. */
  hasPdf?: boolean;
}
