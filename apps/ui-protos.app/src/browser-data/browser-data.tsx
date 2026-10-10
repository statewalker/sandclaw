import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@statewalker/ui.view.shadcn";
import {
  Download,
  FolderInput,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import type { ChatEntry } from "../conversations/chat-index.js";
import { mockChats } from "../conversations/chat-index.js";
import { today } from "../mock.js";
import {
  EXPORT_FOLDER,
  exportFileNames,
  formatBytes,
  GB,
  mockParts,
  olderThan,
  type PartKind,
  type Recovery,
  type StoragePart,
  summarize,
  zipName,
} from "./storage.js";

/** Whether the browser agreed to keep Sandclaw's data (`navigator.storage.persist()`). */
export type Persist = "not-asked" | "granted" | "denied";

export interface BrowserDataProps {
  persist?: Persist;
  /** What the browser answers when asked to protect the data (prototype only). */
  browserAnswers?: boolean;
  /** What the browser allows this site (`navigator.storage.estimate().quota`). */
  quota?: number;
  parts?: StoragePart[];
  chats?: ChatEntry[];
  now?: Date;
  /** Opens My identity, where "Empty this browser" lives. */
  onOpenIdentity?: () => void;
}

const FOLDER = "Atelier docs";

const partColor: Record<PartKind, string> = {
  indexes: "bg-primary/45",
  chats: "bg-primary",
  drafts: "bg-warning",
  settings: "bg-muted-foreground",
  identity: "bg-success",
};

const groups: [Recovery, string][] = [
  ["lost", "Lost if the browser clears it"],
  ["rebuilt", "Comes back on its own"],
  ["relink", "Comes back by linking this browser again"],
];

const ages: [string, number, string][] = [
  ["7", 7, "1 week"],
  ["30", 30, "1 month"],
  ["90", 90, "3 months"],
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2 border-t pt-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

/** A destructive action behind a confirmation that says what will happen. */
function Confirm({
  trigger,
  title,
  children,
  action,
  onConfirm,
  disabled,
}: {
  trigger: ReactNode;
  title: string;
  children: ReactNode;
  action: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled}>
          {trigger}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{children}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive hover:bg-destructive/90 text-white"
            onClick={onConfirm}
          >
            {action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ProtectRow({ persist, ask }: { persist: Persist | "asking"; ask: () => void }) {
  if (persist === "granted")
    return (
      <p className="flex gap-2 text-sm">
        <ShieldCheck className="text-success mt-0.5 size-4 shrink-0" />
        <span>
          Protected: this browser won&apos;t clear Sandclaw&apos;s data on its own. Clearing site
          data or history by hand still deletes it.
        </span>
      </p>
    );
  return (
    <div className="grid gap-2 text-sm">
      {persist === "denied" ? (
        <p className="flex gap-2">
          <ShieldAlert className="text-warning mt-0.5 size-4 shrink-0" />
          <span>
            Not granted. The browser decides by itself: Chrome and Edge grant it to sites you use
            often or install as an app; Firefox asks you. Until then, keep a copy of your chats.
          </span>
        </p>
      ) : (
        <p className="text-muted-foreground">
          When the disk runs low, a browser may clear a site&apos;s data without asking. You can ask
          this browser to keep Sandclaw&apos;s.
        </p>
      )}
      <Button
        size="sm"
        variant={persist === "denied" ? "outline" : "default"}
        className="justify-self-start"
        disabled={persist === "asking"}
        onClick={ask}
      >
        {persist === "asking" ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
        {persist === "denied" ? "Ask again" : "Protect from automatic clearing"}
      </Button>
    </div>
  );
}

/** How much Sandclaw keeps in this browser, what losing it means, and how to keep a copy. */
export function BrowserData({
  persist: initialPersist = "not-asked",
  browserAnswers = true,
  quota = 4 * GB,
  parts: initialParts = mockParts,
  chats: initialChats = mockChats.map((c) => c.entry),
  now = today,
  onOpenIdentity,
}: BrowserDataProps) {
  const [persist, setPersist] = useState<Persist | "asking">(initialPersist);
  const [parts, setParts] = useState(initialParts);
  const [chats, setChats] = useState(initialChats);
  const [rebuilding, setRebuilding] = useState(false);
  const [age, setAge] = useState("7");
  const [copied, setCopied] = useState("");

  const summary = summarize(parts, quota);
  const days = ages.find(([v]) => v === age)?.[1] ?? 7;
  const ageLabel = ages.find(([v]) => v === age)?.[2] ?? "";
  const old = olderThan(chats, days, now);
  const plural = (n: number) => `${n} chat${n === 1 ? "" : "s"}`;

  const ask = () => {
    setPersist("asking");
    // Stands in for `navigator.storage.persist()`.
    setTimeout(() => setPersist(browserAnswers ? "granted" : "denied"), 400);
  };

  const deleteOld = () => {
    const gone = new Set(old.map((c) => c.id));
    const left = chats.filter((c) => !gone.has(c.id));
    setParts(
      parts.map((p) =>
        p.kind === "chats"
          ? { ...p, bytes: Math.round((p.bytes * left.length) / chats.length) }
          : p,
      ),
    );
    setChats(left);
  };

  const rebuild = () => {
    setParts(parts.map((p) => (p.kind === "indexes" ? { ...p, bytes: 0 } : p)));
    setRebuilding(true);
  };

  const files = exportFileNames(chats);

  return (
    <Card className="w-full max-w-2xl gap-4">
      <CardHeader>
        <CardTitle>Data kept in this browser</CardTitle>
        <CardDescription>
          Your files and notes stay in {FOLDER}, on your disk. This browser keeps everything else
          Sandclaw needs.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
            <span className="font-medium">{formatBytes(summary.used)} used</span>
            <span className="text-muted-foreground text-xs">
              of about {formatBytes(quota)} this browser allows
            </span>
          </div>
          <div
            // The line above says it in words; the bar only shows the proportions.
            aria-hidden
            className="bg-muted flex h-2 overflow-hidden rounded-full"
          >
            {parts.map((p) => (
              <div
                key={p.kind}
                className={partColor[p.kind]}
                style={{ width: `${(100 * p.bytes) / quota}%` }}
              />
            ))}
          </div>
          {summary.fraction > 0.8 && (
            <p className="text-sm">
              This browser is nearly full. When it is, it may clear Sandclaw&apos;s data, and the
              assistant stops reading new files. Free up space below.
            </p>
          )}
        </div>

        {groups.map(([recovery, heading]) =>
          summary.parts[recovery].length === 0 ? null : (
            <div key={recovery} className="grid gap-1">
              <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                {heading} · {formatBytes(summary.bytes[recovery])}
              </h4>
              <ul className="grid gap-2">
                {summary.parts[recovery].map((p) => (
                  <li key={p.kind} className="flex gap-2.5 text-sm">
                    <span
                      className={cn("mt-1.5 size-2 shrink-0 rounded-full", partColor[p.kind])}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap justify-between gap-x-2">
                        <span className="font-medium">
                          {p.label}
                          {p.kind === "chats" && ` (${chats.length})`}
                        </span>
                        <span className="tabular-nums">
                          {p.kind === "indexes" && rebuilding ? (
                            <span className="text-muted-foreground flex items-center gap-1 text-xs">
                              <Loader2 className="size-3 animate-spin" /> Rebuilding from your files
                            </span>
                          ) : (
                            formatBytes(p.bytes)
                          )}
                        </span>
                      </span>
                      <span className="text-muted-foreground block text-xs">
                        {p.what} {p.ifCleared}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ),
        )}

        <Section title="Protect from automatic clearing">
          <ProtectRow persist={persist} ask={ask} />
        </Section>

        <Section title="Keep a copy">
          <p className="text-muted-foreground text-sm">
            Notes are already files in {FOLDER}/Notes: they are as safe as your folder. Chats live
            only here; save them as Markdown, one file per chat.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={chats.length === 0}
              onClick={() =>
                setCopied(
                  `Saved ${plural(chats.length)} in ${FOLDER}/${EXPORT_FOLDER}/, e.g. “${files[0]}”.`,
                )
              }
            >
              <FolderInput /> Save chats into your folder
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={chats.length === 0}
              onClick={() => setCopied(`Downloaded ${zipName(now)} (${plural(chats.length)}).`)}
            >
              <Download /> Download a .zip
            </Button>
          </div>
          {copied && <p className="bg-muted rounded-md px-3 py-2 text-sm break-words">{copied}</p>}
        </Section>

        <Section title="Free up space">
          <div className="flex flex-wrap items-center gap-2">
            <Confirm
              trigger={
                <>
                  <RefreshCw /> Rebuild search indexes
                </>
              }
              title="Delete and rebuild the search indexes?"
              action="Rebuild"
              disabled={rebuilding}
              onConfirm={rebuild}
            >
              The assistant forgets what it read and reads {FOLDER} again. Until it&apos;s done,
              answers may miss things. Your files are not touched.
            </Confirm>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Chats older than</span>
            <Select value={age} onValueChange={setAge}>
              <SelectTrigger aria-label="Older than" className="h-8 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ages.map(([value, , label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Confirm
              trigger={
                <>
                  <Trash2 /> Delete {plural(old.length)}…
                </>
              }
              title={`Delete ${plural(old.length)} older than ${ageLabel}?`}
              action={`Delete ${plural(old.length)}`}
              disabled={old.length === 0}
              onConfirm={deleteOld}
            >
              They are gone from this browser for good. Save a copy into your folder first if you
              may need them again.
            </Confirm>
          </div>
          <p className="text-muted-foreground text-sm">
            To remove everything, identity included, use{" "}
            <Button variant="link" className="h-auto p-0" onClick={onOpenIdentity}>
              Empty this browser
            </Button>{" "}
            in My identity.
          </p>
        </Section>
      </CardContent>
    </Card>
  );
}
