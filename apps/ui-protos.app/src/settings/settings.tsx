import {
  Button,
  Card,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  Input,
} from "@statewalker/ui.view.shadcn";
import { ArrowLeft, ChevronRight, Search, Settings as SettingsIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { AgentTools } from "../agent-tools/agent-tools.js";
import { AiModels } from "../ai-models/ai-models.js";
import { BrowserData } from "../browser-data/browser-data.js";
import { Connectors } from "../connectors/connectors.js";
import { IndexingPage } from "../indexing/indexing.js";
import { InvitationsLog } from "../invitations-log/invitations-log.js";
import { MyIdentityPage } from "../my-identity/my-identity.js";
import { NotificationSettings } from "../notifications/notification-settings.js";
import { Services } from "../services/services.js";
import { TeamOneList } from "../team/team.js";
import { Appearance } from "./appearance.js";
import {
  groupLabels,
  resolveSection,
  type SearchHit,
  type SectionId,
  searchSections,
  type Viewer,
  visibleSections,
} from "./settings-model.js";

/**
 * Where Settings opens:
 * - `page`: a full-page route that replaces the workspace, with a way back to it;
 * - `dialog`: a large dialog over the workspace, which stays where it was underneath.
 */
export type SettingsVariant = "page" | "dialog";

export interface SettingsProps {
  variant?: SettingsVariant;
  viewer?: Viewer;
  /**
   * The section opened first (a deep link, e.g. from a notification). Unknown or not
   * allowed for the viewer: the first section. On a phone, no section opens the list.
   */
  section?: string;
  query?: string;
  /** Phone layout: the section list is a page, each section a sub-page with Back. */
  phone?: boolean;
}

/** The existing screens, embedded as they are. */
function SectionView({
  id,
  viewer,
  go,
}: {
  id: SectionId;
  viewer: Viewer;
  go: (id: SectionId) => void;
}) {
  switch (id) {
    case "me":
      return <MyIdentityPage />;
    case "appearance":
      return <Appearance />;
    case "notifications":
      return (
        <Card className="w-full max-w-2xl gap-0 py-0">
          <h2 className="border-b p-4 font-semibold">Notifications</h2>
          <NotificationSettings viewer={viewer} />
        </Card>
      );
    case "connectors":
      return <Connectors variant="list" />;
    case "agent-tools":
      return <AgentTools variant="groups" />;
    case "browser":
      return <BrowserData onOpenIdentity={() => go("me")} />;
    case "indexing":
      return <IndexingPage />;
    case "team":
      return <TeamOneList viewer={viewer} />;
    case "invitations":
      return <InvitationsLog />;
    case "services":
      return <Services variant="inline" />;
    case "ai-models":
      return <AiModels variant="one-page" />;
  }
}

function SectionList({
  hits,
  query,
  current,
  phone,
  onPick,
}: {
  hits: SearchHit[];
  query: string;
  current: SectionId | null;
  phone: boolean;
  onPick: (id: SectionId) => void;
}) {
  if (hits.length === 0) {
    return <p className="text-muted-foreground p-3 text-sm">No settings match “{query.trim()}”</p>;
  }
  const groups = Map.groupBy(hits, (h) => h.section.group);
  return (
    <div className="grid gap-4">
      {[...groups].map(([group, items]) => (
        <section key={group} className="grid gap-1">
          <h2 className="text-muted-foreground px-3 text-xs font-medium uppercase">
            {groupLabels[group]}
          </h2>
          <ul className={cn("grid", phone && "divide-y rounded-md border")}>
            {items.map(({ section, keyword }) => (
              <li key={section.id}>
                <button
                  type="button"
                  aria-current={!phone && current === section.id ? "page" : undefined}
                  onClick={() => onPick(section.id)}
                  className={cn(
                    "hover:bg-accent flex w-full items-center gap-2 px-3 text-left text-sm",
                    phone ? "py-3" : "rounded-md py-2",
                    !phone && current === section.id && "bg-accent font-medium",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    {section.label}
                    {keyword && (
                      <span className="text-muted-foreground block text-xs">
                        Matches “{keyword}”
                      </span>
                    )}
                  </span>
                  {phone && <ChevronRight className="text-muted-foreground size-4 shrink-0" />}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Navigation, search and the open section; the same inside a page and a dialog. */
function SettingsBody({
  viewer,
  section,
  query: initialQuery = "",
  phone = false,
  header,
}: Omit<SettingsProps, "variant"> & { viewer: Viewer; header: ReactNode }) {
  const [current, setCurrent] = useState<SectionId | null>(
    phone && section === undefined ? null : resolveSection(viewer, section),
  );
  const [query, setQuery] = useState(initialQuery);
  const hits = searchSections(visibleSections(viewer), query);

  const search = (
    <div className="relative">
      <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
      <Input
        aria-label="Search settings"
        placeholder="Search settings"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          const first = hits[0];
          if (e.key === "Enter" && first) setCurrent(first.section.id);
        }}
        className="pl-8"
      />
    </div>
  );
  const nav = (
    <nav aria-label="Settings sections" className="grid content-start gap-3">
      {search}
      <SectionList hits={hits} query={query} current={current} phone={phone} onPick={setCurrent} />
    </nav>
  );

  if (phone) {
    if (current === null) {
      return (
        <div className="grid min-w-0 content-start gap-4 p-4">
          {header}
          {nav}
        </div>
      );
    }
    const label = visibleSections(viewer).find((s) => s.id === current)?.label;
    return (
      <div className="grid min-w-0 content-start gap-3 p-2">
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setCurrent(null)}>
            <ArrowLeft /> Back
          </Button>
          <span className="text-muted-foreground truncate text-sm">Settings · {label}</span>
        </div>
        <div className="grid min-w-0 justify-items-center">
          <SectionView id={current} viewer={viewer} go={setCurrent} />
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-y-auto md:overflow-hidden">
      <div className="border-b p-4">{header}</div>
      <div className="grid min-h-0 min-w-0 md:grid-cols-[15rem_minmax(0,1fr)]">
        <div className="min-w-0 border-b p-3 md:overflow-y-auto md:border-r md:border-b-0">
          {nav}
        </div>
        <main className="grid min-w-0 content-start justify-items-center p-4 md:overflow-y-auto">
          {current && <SectionView id={current} viewer={viewer} go={setCurrent} />}
        </main>
      </div>
    </div>
  );
}

/** A stand-in for the workspace behind the dialog, with the gear that opens Settings. */
function WorkspaceBehind({ children }: { children: ReactNode }) {
  return (
    <div className="bg-muted/40 grid h-[85svh] w-full max-w-6xl grid-rows-[auto_1fr] overflow-hidden rounded-md border">
      <div className="bg-background flex items-center justify-between border-b px-3 py-2 text-sm">
        <span className="font-medium">Atelier Morel</span>
        {children}
      </div>
      <p className="text-muted-foreground self-center text-center text-sm">The workspace</p>
    </div>
  );
}

export function Settings({ variant = "page", viewer = "admin", ...props }: SettingsProps) {
  if (variant === "dialog" && !props.phone) {
    return (
      <WorkspaceBehind>
        <Dialog defaultOpen>
          <DialogTrigger asChild>
            <Button size="sm" variant="ghost" aria-label="Settings">
              <SettingsIcon />
            </Button>
          </DialogTrigger>
          <DialogContent className="grid h-[85svh] w-[calc(100%-2rem)] max-w-5xl grid-rows-[minmax(0,1fr)] gap-0 overflow-hidden p-0">
            <SettingsBody
              viewer={viewer}
              {...props}
              header={
                <div className="grid gap-1 pr-8">
                  <DialogTitle>Settings</DialogTitle>
                  <DialogDescription>
                    The workspace stays as it was behind this window.
                  </DialogDescription>
                </div>
              }
            />
          </DialogContent>
        </Dialog>
      </WorkspaceBehind>
    );
  }

  return (
    <div
      className={cn(
        "bg-background grid w-full overflow-hidden rounded-md border",
        props.phone
          ? "max-w-[390px] content-start"
          : "h-[85svh] max-w-6xl grid-rows-[minmax(0,1fr)]",
      )}
    >
      <SettingsBody
        viewer={viewer}
        {...props}
        header={
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost">
              <ArrowLeft /> Workspace
            </Button>
            <h1 className="text-lg font-semibold">Settings</h1>
          </div>
        }
      />
    </div>
  );
}
