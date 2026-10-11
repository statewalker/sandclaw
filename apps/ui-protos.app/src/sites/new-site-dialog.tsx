import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@statewalker/ui.view.shadcn";
import { Folder, ListTree, Sparkles } from "lucide-react";
import { type ReactNode, useState } from "react";
import { folder, group } from "../mock.js";
import { topics } from "./mock-sites.js";
import { newSite, type Site, suggestFromFolder } from "./site-model.js";
import { OnlyHere } from "./site-parts.js";

export interface NewSiteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The id the new site will have. */
  siteId: string;
  /** Opens with "from topics" chosen: the default site. */
  initialSource?: "folder" | "topics";
  onCreate: (site: Site) => void;
  onEditToc: (siteId: string) => void;
}

const folders = folder.filter((f) => f.children);

function Choice({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "flex items-start gap-2 rounded-md border p-3 text-left text-sm",
        pressed ? "border-primary bg-primary/5 ring-primary ring-1" : "hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

/** Two steps: what the site is about, then the suggested table of contents. */
export function NewSiteDialog({
  open,
  onOpenChange,
  siteId,
  initialSource = "folder",
  onCreate,
  onEditToc,
}: NewSiteDialogProps) {
  const [stepNo, setStepNo] = useState<1 | 2>(1);
  const [from, setFrom] = useState(initialSource);
  const [folderName, setFolderName] = useState(folders[0]?.name ?? "");
  const [name, setName] = useState("");

  const defaultName = from === "topics" ? `About ${group.name}` : folderName;
  const titles =
    from === "topics"
      ? topics
      : suggestFromFolder(folderName, folders.find((f) => f.name === folderName)?.children ?? []);

  const close = (o: boolean) => {
    if (!o) setStepNo(1);
    onOpenChange(o);
  };
  const generate = () => {
    const source =
      from === "topics"
        ? { kind: "topics" as const }
        : { kind: "folder" as const, path: folderName };
    onCreate(newSite(siteId, name.trim() || defaultName, source, titles));
    close(false);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New site</DialogTitle>
          <DialogDescription>
            The assistant writes the pages from your files and cites every fact.
          </DialogDescription>
        </DialogHeader>
        {stepNo === 1 ? (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <span className="text-sm font-medium">Start from</span>
              <div className="grid gap-2 sm:grid-cols-2">
                <Choice pressed={from === "folder"} onClick={() => setFrom("folder")}>
                  <Folder className="mt-0.5 size-4 shrink-0" />
                  <span>
                    <span className="block font-medium">A folder</span>
                    <span className="text-muted-foreground text-xs">
                      One page per subject in it
                    </span>
                  </span>
                </Choice>
                <Choice pressed={from === "topics"} onClick={() => setFrom("topics")}>
                  <Sparkles className="mt-0.5 size-4 shrink-0" />
                  <span>
                    <span className="block font-medium">The topics Ask found</span>
                    <span className="text-muted-foreground text-xs">
                      A default site about your whole folder
                    </span>
                  </span>
                </Choice>
              </div>
            </div>
            {from === "folder" && (
              <div className="grid gap-2" role="radiogroup" aria-label="Folder">
                {folders.map((f) => (
                  // biome-ignore lint/a11y/useSemanticElements: a styled radio, like the choices above
                  <button
                    key={f.name}
                    type="button"
                    role="radio"
                    aria-checked={folderName === f.name}
                    onClick={() => setFolderName(f.name)}
                    className={cn(
                      "flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm",
                      folderName === f.name ? "border-primary bg-primary/5" : "hover:bg-accent",
                    )}
                  >
                    <Folder className="text-muted-foreground size-4" /> {f.name}
                    <span className="text-muted-foreground ml-auto text-xs">
                      {f.children?.length === 1 ? "1 item" : `${f.children?.length} items`}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="new-site-name">Name</Label>
              <Input
                id="new-site-name"
                placeholder={defaultName}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-auto text-sm font-medium">
                Suggested table of contents · {titles.length} pages
              </span>
              <Button size="sm" variant="outline" onClick={() => onEditToc(siteId)}>
                <ListTree /> Edit table of contents
              </Button>
            </div>
            <ol className="bg-muted/40 grid list-inside list-decimal gap-1 rounded-md border p-3 text-sm">
              {titles.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ol>
            <p className="text-muted-foreground text-xs">
              Writing takes about {titles.length} minutes, one page at a time. You can close this
              window; keep the browser open.
            </p>
            <OnlyHere />
          </div>
        )}
        <DialogFooter>
          {stepNo === 1 ? (
            <Button onClick={() => setStepNo(2)}>Next</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStepNo(1)}>
                Back
              </Button>
              <Button onClick={generate}>Generate</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
