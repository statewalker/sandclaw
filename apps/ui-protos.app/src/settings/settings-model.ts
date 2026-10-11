/** Who opens Settings: a member never sees the group's admin sections. */
export type Viewer = "admin" | "member";

export type SectionId =
  | "me"
  | "appearance"
  | "notifications"
  | "connectors"
  | "agent-tools"
  | "browser"
  | "indexing"
  | "team"
  | "invitations"
  | "services"
  | "ai-models";

/** "you": about me and this browser; "admin": about the whole group. */
export type SectionGroup = "you" | "admin";

export interface SectionInfo {
  id: SectionId;
  label: string;
  group: SectionGroup;
  /** Words people search with that are not in the label ("lock" → Me). */
  keywords: string[];
}

export const groupLabels: Record<SectionGroup, string> = {
  you: "You",
  admin: "Your group — admin",
};

/** In navigation order. */
export const sections: SectionInfo[] = [
  {
    id: "me",
    label: "Me",
    group: "you",
    keywords: ["name", "devices", "phone", "lock", "password", "leave", "identity"],
  },
  {
    id: "appearance",
    label: "Appearance",
    group: "you",
    keywords: ["theme", "dark", "light", "text size", "font", "density", "compact"],
  },
  {
    id: "notifications",
    label: "Notifications",
    group: "you",
    keywords: ["alerts", "bell", "toasts", "sound"],
  },
  {
    id: "connectors",
    label: "Connectors",
    group: "you",
    keywords: ["mail", "calendar", "drive", "mcp", "sign in"],
  },
  {
    id: "agent-tools",
    label: "Agent tools",
    group: "you",
    keywords: ["permissions", "allow", "ask", "block", "commands", "apps"],
  },
  {
    id: "browser",
    label: "This browser",
    group: "you",
    keywords: ["storage", "space", "quota", "data", "chats", "protect"],
  },
  {
    id: "indexing",
    label: "What the assistant reads",
    group: "you",
    keywords: ["indexing", "folders", "files", "read again", "exclude"],
  },
  {
    id: "team",
    label: "Team",
    group: "admin",
    keywords: ["people", "members", "roles", "remove", "devices"],
  },
  {
    id: "invitations",
    label: "Invitations",
    group: "admin",
    keywords: ["invite", "links", "log", "joined", "expired"],
  },
  {
    id: "services",
    label: "Services",
    group: "admin",
    keywords: ["printer", "scanner", "addresses", "network"],
  },
  {
    id: "ai-models",
    label: "AI models",
    group: "admin",
    keywords: ["model", "llm", "token", "usage", "cost", "litellm", "embeddings"],
  },
];

export function visibleSections(viewer: Viewer): SectionInfo[] {
  return viewer === "admin" ? sections : sections.filter((s) => s.group === "you");
}

/** The section a deep link opens: unknown or not allowed falls back to the first one. */
export function resolveSection(viewer: Viewer, requested?: string): SectionId {
  const shown = visibleSections(viewer);
  return (shown.find((s) => s.id === requested) ?? shown[0])?.id ?? "me";
}

export interface SearchHit {
  section: SectionInfo;
  /** The keyword that matched, when the label did not. */
  keyword?: string;
}

/** Lower case, accents removed. */
function fold(text: string) {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * Sections whose label or one of whose keywords has a word starting with the query
 * ("lock" finds Me's "lock", not Agent tools' "block"); all of them when empty.
 */
export function searchSections(shown: SectionInfo[], query: string): SearchHit[] {
  const q = fold(query.trim());
  if (!q) return shown.map((section) => ({ section }));
  const starts = (text: string) => ` ${fold(text)}`.includes(` ${q}`);
  return shown.flatMap((section): SearchHit[] => {
    if (starts(section.label)) return [{ section }];
    const keyword = section.keywords.find(starts);
    return keyword ? [{ section, keyword }] : [];
  });
}
