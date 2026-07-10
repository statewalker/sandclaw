import { ChevronLeft, Library } from "lucide-react";

export type NavSection = "home" | "reports" | "topics" | "answers" | "search";

function enc(s: string) {
  return encodeURIComponent(s);
}

/**
 * Shared top navigation: breadcrumb to the projects list + the current project,
 * and section links (Reports / Answers / Search) for that project. Plain anchors
 * — rendered identically on server list pages and inside the workspace island.
 */
export function ProjectNav({
  project,
  section,
}: {
  project: string;
  section: NavSection;
}) {
  const links: { key: NavSection; href: string; label: string }[] = [
    {
      key: "reports",
      href: `/projects/${enc(project)}/reports`,
      label: "Reports",
    },
    {
      key: "topics",
      href: `/projects/${enc(project)}/topics`,
      label: "Topics",
    },
    {
      key: "answers",
      href: `/projects/${enc(project)}/answers`,
      label: "Answers",
    },
    {
      key: "search",
      href: `/projects/${enc(project)}/search`,
      label: "Search",
    },
  ];
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
      <a
        href="/projects"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Projects
      </a>
      <span className="text-muted-foreground">/</span>
      <a
        href={`/projects/${enc(project)}`}
        className="flex items-center gap-1.5 text-sm font-medium hover:underline"
      >
        <Library className="size-4 text-muted-foreground" />
        {project}
      </a>
      <nav className="ml-2 flex items-center gap-1">
        {links.map((l) => (
          <a
            key={l.key}
            href={l.href}
            className={`rounded-md px-2.5 py-1 text-sm transition-colors ${
              section === l.key
                ? "bg-accent font-medium text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            }`}
          >
            {l.label}
          </a>
        ))}
      </nav>
    </header>
  );
}
