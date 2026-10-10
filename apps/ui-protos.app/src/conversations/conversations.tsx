import {
  Button,
  Card,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
} from "@statewalker/ui.view.shadcn";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  Loader2,
  MessageSquarePlus,
  NotebookPen,
  Pencil,
  Search,
  X,
} from "lucide-react";
import { type ReactNode, useState, useSyncExternalStore } from "react";
import { AskToolUI, askAgent, CitedText } from "../ask/grounded-answer.js";
import {
  createMockFlueSession,
  isFlueRunning,
  type MockFlueSession,
} from "../chat/flue-runtime.js";
import { FlueThread } from "../chat/thread.js";
import { today } from "../mock.js";
import {
  activityLabel,
  activityOf,
  archive,
  byActivity,
  type ChatEntry,
  type ChatIndex,
  chatAsNote,
  groupByTime,
  type MockChat,
  matchSnippet,
  mockChats,
  newChat,
  recordActivity,
  rename,
  searchChats,
  sessionState,
  transcriptText,
  UNTITLED,
  unarchive,
} from "./chat-index.js";

// The chats store: the chat index plus one mock Flue session per chat. Opening a
// chat is choosing which session the thread shows (in Sandclaw: which session URL
// the thread connects to). Session changes flow back into the index: the first
// question titles an untitled chat, the last reply is its preview.

interface Snapshot {
  index: ChatIndex;
  currentId: string;
}

function createChats({ chats, delay }: { chats: MockChat[]; delay: number }) {
  const sessions = new Map<string, MockFlueSession>();
  const listeners = new Set<() => void>();
  let tick = 0;
  // "Now" moves on from the prototypes' fixed `today`, a second per event.
  const now = () => new Date(today.getTime() + ++tick * 1000);
  // The chat that opens first: the first one given, not the busiest.
  let snap: Snapshot = {
    index: chats.map((c) => c.entry),
    currentId: chats.find((c) => !c.entry.archived)?.entry.id ?? "",
  };
  const set = (next: Partial<Snapshot>) => {
    snap = { ...snap, ...next };
    for (const l of listeners) l();
  };

  const track = (id: string, session: MockFlueSession) => {
    sessions.set(id, session);
    let count = activityOf(session.getState()).count;
    session.subscribe(() => {
      const a = activityOf(session.getState());
      const at = a.count !== count ? now() : undefined;
      count = a.count;
      set({ index: recordActivity(snap.index, id, { ...a, at }) });
    });
  };

  for (const c of chats) {
    const session = createMockFlueSession({
      agent: askAgent,
      // The chat answering as the prototype opens stays busy for a while.
      delay: c.asking ? delay * 15 : delay,
      initial: sessionState(c.entry.id, c.turns),
    });
    track(c.entry.id, session);
    if (c.asking) session.send({ kind: "user", body: c.asking });
  }

  let seq = 0;
  const create = () => {
    const id = `c_new_${++seq}`;
    track(id, createMockFlueSession({ agent: askAgent, delay }));
    set({ index: newChat(snap.index, id, now()), currentId: id });
  };

  if (!snap.currentId) create();

  const session = (id: string) => sessions.get(id) as MockFlueSession;
  return {
    getState: () => snap,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    session,
    isRunning: (id: string) => isFlueRunning(session(id).getState()),
    textOf: (id: string) => transcriptText(session(id).getState()),
    open: (id: string) => set({ currentId: id }),
    /** A chat with nothing said yet is reused rather than doubled. */
    newChat() {
      if (activityOf(session(snap.currentId).getState()).count > 0) create();
    },
    rename: (id: string, title: string) => set({ index: rename(snap.index, id, title) }),
    archive(id: string) {
      const index = archive(snap.index, id);
      set({ index });
      if (snap.currentId !== id) return;
      const next = byActivity(index.filter((e) => !e.archived))[0];
      if (next) set({ currentId: next.id });
      else create();
    },
    restore: (id: string) => set({ index: unarchive(snap.index, id) }),
    /** Here the note would be written into the folder; the prototype only builds it. */
    saveAsNote(id: string) {
      const entry = snap.index.find((e) => e.id === id) as ChatEntry;
      return chatAsNote(entry, session(id).getState());
    },
  };
}

type Chats = ReturnType<typeof createChats>;

// --- The list ------------------------------------------------------------------

function ChatRow({
  chat,
  current,
  running,
  snippet,
  onOpen,
}: {
  chat: ChatEntry;
  current: boolean;
  running: boolean;
  snippet?: string;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        aria-current={current ? "true" : undefined}
        onClick={onOpen}
        className={cn(
          "hover:bg-muted/60 flex w-full min-w-0 flex-col gap-0.5 rounded-md px-2.5 py-2 text-left",
          current && "bg-accent text-accent-foreground hover:bg-accent",
        )}
      >
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{chat.title}</span>
          {running ? (
            <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
              <Loader2 className="size-3 animate-spin" /> Answering…
            </span>
          ) : (
            <span className="text-muted-foreground shrink-0 text-xs">
              {activityLabel(chat.lastActivity, today)}
            </span>
          )}
        </span>
        <span className="text-muted-foreground truncate text-xs">
          {snippet ?? (chat.preview || "No messages yet")}
        </span>
      </button>
    </li>
  );
}

function ChatList({ chats, onOpened }: { chats: Chats; onOpened?: () => void }) {
  const { index, currentId } = useSyncExternalStore(chats.subscribe, chats.getState);
  const [query, setQuery] = useState("");
  const found = searchChats(index, query, chats.textOf);
  const active = found.filter((e) => !e.archived);
  const archived = byActivity(found.filter((e) => e.archived));
  const open = (id: string) => {
    chats.open(id);
    onOpened?.();
  };
  const snippetOf = (e: ChatEntry) => (query ? matchSnippet(chats.textOf(e.id), query) : undefined);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <Button
        variant="outline"
        className="justify-start"
        onClick={() => {
          chats.newChat();
          onOpened?.();
        }}
      >
        <MessageSquarePlus /> New chat
      </Button>
      <div className="relative">
        <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
        <Input
          type="search"
          aria-label="Search chats"
          placeholder="Search chats"
          className="pl-8"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <nav aria-label="Chats" className="min-h-0 flex-1 overflow-y-auto">
        {query && active.length === 0 && archived.length === 0 && (
          <p className="text-muted-foreground px-2.5 py-2 text-sm">No chat mentions “{query}”.</p>
        )}
        {groupByTime(active, today).map((g) => (
          <section key={g.label} aria-label={g.label} className="mb-2">
            <h3 className="text-muted-foreground px-2.5 py-1 text-xs font-medium">{g.label}</h3>
            <ul>
              {g.chats.map((c) => (
                <ChatRow
                  key={c.id}
                  chat={c}
                  current={c.id === currentId}
                  running={chats.isRunning(c.id)}
                  snippet={snippetOf(c)}
                  onOpen={() => open(c.id)}
                />
              ))}
            </ul>
          </section>
        ))}
        {archived.length > 0 && (
          <Collapsible defaultOpen={Boolean(query)} key={query ? "q" : ""}>
            <CollapsibleTrigger className="group text-muted-foreground flex w-full items-center gap-1 px-2.5 py-1 text-xs font-medium">
              <ChevronRight className="size-3.5 transition-transform group-data-[state=open]:rotate-90" />
              Archived ({archived.length})
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul aria-label="Archived">
                {archived.map((c) => (
                  <li key={c.id} className="flex min-w-0 items-center gap-2 px-2.5 py-1.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{c.title}</span>
                      <span className="text-muted-foreground block text-xs">
                        {activityLabel(c.lastActivity, today)}
                      </span>
                    </span>
                    <Button size="sm" variant="outline" onClick={() => chats.restore(c.id)}>
                      <ArchiveRestore /> Restore
                    </Button>
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        )}
      </nav>
    </div>
  );
}

// --- The open chat ---------------------------------------------------------------

type Notice =
  | { kind: "saved"; path: string; markdown: string }
  | { kind: "archived"; chat: ChatEntry };

/** Title (renamed in place) and the chat's actions: save as note, archive. */
function ChatActions({
  chats,
  chat,
  onNotice,
  title,
  children,
}: {
  chats: Chats;
  chat: ChatEntry;
  onNotice: (n: Notice) => void;
  /** Replaces the plain title, e.g. by the switcher button. */
  title?: ReactNode;
  /** More buttons, before the chat's own actions. */
  children?: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const said = activityOf(chats.session(chat.id).getState()).count > 0;
  const commit = (value: string) => {
    chats.rename(chat.id, value);
    setEditing(false);
  };
  return (
    <div className="flex min-w-0 items-center gap-1 border-b p-2">
      {editing ? (
        <Input
          aria-label="Chat title"
          autoFocus
          defaultValue={chat.title === UNTITLED ? "" : chat.title}
          placeholder={UNTITLED}
          className="h-8 min-w-0 flex-1"
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit(e.currentTarget.value);
            if (e.key === "Escape") setEditing(false);
          }}
        />
      ) : (
        (title ?? (
          <h2 className="min-w-0 flex-1 truncate px-1 text-sm font-medium">{chat.title}</h2>
        ))
      )}
      {children}
      {!editing && (
        <Button
          size="icon"
          variant="ghost"
          aria-label="Rename"
          title="Rename"
          onClick={() => setEditing(true)}
        >
          <Pencil />
        </Button>
      )}
      <Button
        size="icon"
        variant="ghost"
        aria-label="Save as note"
        title="Save as note — writes this chat into Notes/"
        disabled={!said}
        onClick={() => onNotice({ kind: "saved", ...chats.saveAsNote(chat.id) })}
      >
        <NotebookPen />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label="Archive"
        title="Archive — you can find it under Archived"
        onClick={() => {
          chats.archive(chat.id);
          onNotice({ kind: "archived", chat });
        }}
      >
        <Archive />
      </Button>
    </div>
  );
}

function NoticeBar({
  notice,
  chats,
  onClose,
}: {
  notice: Notice;
  chats: Chats;
  onClose: () => void;
}) {
  const [reading, setReading] = useState(false);
  return (
    <div
      role="status"
      className="bg-muted/60 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-b px-3 py-1.5 text-sm"
    >
      {notice.kind === "saved" ? (
        <>
          <span className="min-w-0 flex-1 break-words">Saved as {notice.path}</span>
          <Button size="sm" variant="outline" onClick={() => setReading(true)}>
            Open
          </Button>
          <Dialog open={reading} onOpenChange={setReading}>
            <DialogContent className="max-h-[90svh] grid-rows-[auto_minmax(0,1fr)]">
              <DialogHeader className="min-w-0">
                <DialogTitle className="break-words">{notice.path.split("/").at(-1)}</DialogTitle>
                <DialogDescription>
                  Notes · here the note would open in your folder.
                </DialogDescription>
              </DialogHeader>
              <pre className="bg-muted/40 min-h-0 overflow-y-auto rounded-md border p-3 text-xs whitespace-pre-wrap">
                {notice.markdown}
              </pre>
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 break-words">
            Archived “{notice.chat.title}” — you can find it under Archived.
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              chats.restore(notice.chat.id);
              onClose();
            }}
          >
            Undo
          </Button>
        </>
      )}
      <Button size="icon" variant="ghost" className="size-7" aria-label="Dismiss" onClick={onClose}>
        <X />
      </Button>
    </div>
  );
}

export const suggestions = [
  "When does the Dupont job start?",
  "What is the Dupont budget, and who is the site foreman?",
  "How much did we pay for the Leroy roof timber?",
];

/** A new chat: what the assistant can do, and a few questions over the folder to start. */
function FirstQuestions({ session }: { session: MockFlueSession }) {
  return (
    <div className="flex flex-col gap-3 py-6">
      <p className="font-medium">Ask anything about the files in your folder.</p>
      <p className="text-muted-foreground text-sm">
        Answers come from your files, with the passages they rely on. For example:
      </p>
      <div className="flex flex-col items-start gap-2">
        {suggestions.map((q) => (
          <Button
            key={q}
            size="sm"
            variant="outline"
            className="h-auto max-w-full py-1 text-left whitespace-normal"
            onClick={() => session.send({ kind: "user", body: q })}
          >
            {q}
          </Button>
        ))}
      </div>
    </div>
  );
}

function OpenChat({
  chats,
  header,
  over,
}: {
  chats: Chats;
  header: (onNotice: (n: Notice) => void) => ReactNode;
  /** Shown over the thread (the switcher's list). */
  over?: ReactNode;
}) {
  const { currentId } = useSyncExternalStore(chats.subscribe, chats.getState);
  const [notice, setNotice] = useState<Notice>();
  const session = chats.session(currentId);
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      {header(setNotice)}
      {notice && <NoticeBar notice={notice} chats={chats} onClose={() => setNotice(undefined)} />}
      <div className="relative min-h-0 flex-1">
        {over}
        <FlueThread
          key={currentId}
          session={session}
          tools={{ ask: AskToolUI }}
          Text={CitedText}
          empty={<FirstQuestions session={session} />}
        />
      </div>
    </div>
  );
}

// --- The two variants --------------------------------------------------------------

export interface ConversationsProps {
  /** Milliseconds between steps of the scripted answers; 0 in tests. */
  delay?: number;
  /** No chats yet: the first visit. */
  firstVisit?: boolean;
}

function useChats({ delay = 600, firstVisit }: ConversationsProps) {
  const [chats] = useState(() => createChats({ chats: firstVisit ? [] : mockChats, delay }));
  const snap = useSyncExternalStore(chats.subscribe, chats.getState);
  const current = snap.index.find((e) => e.id === snap.currentId) as ChatEntry;
  return { chats, current };
}

/** A — the chats as a side panel next to the open chat. */
export function ConversationsSidebar(props: ConversationsProps) {
  const { chats, current } = useChats(props);
  return (
    <Card className="grid h-[640px] max-h-[90svh] w-full max-w-4xl grid-rows-[minmax(0,14rem)_minmax(0,1fr)] gap-0 overflow-hidden p-0 md:grid-cols-[16rem_minmax(0,1fr)] md:grid-rows-1">
      <aside aria-label="Conversations" className="min-h-0 border-b md:border-r md:border-b-0">
        <ChatList chats={chats} />
      </aside>
      <OpenChat
        chats={chats}
        header={(onNotice) => <ChatActions chats={chats} chat={current} onNotice={onNotice} />}
      />
    </Card>
  );
}

/** B — a title button in the assistant panel's header that opens the chats over the thread. */
export function ConversationsSwitcher({
  listOpen = false,
  ...props
}: ConversationsProps & { listOpen?: boolean }) {
  const { chats, current } = useChats(props);
  const [open, setOpen] = useState(listOpen);
  const busyElsewhere = chats
    .getState()
    .index.some((e) => e.id !== current.id && !e.archived && chats.isRunning(e.id));
  const switcher = (
    <Button
      variant="ghost"
      aria-expanded={open}
      aria-label={`Chats — ${current.title}`}
      className="h-8 min-w-0 flex-1 justify-start gap-1 px-1"
      onClick={() => setOpen(!open)}
    >
      <span className="min-w-0 truncate font-medium">{current.title}</span>
      <ChevronDown className={cn("shrink-0 transition-transform", open && "rotate-180")} />
      {busyElsewhere && (
        <Loader2
          aria-label="Another chat is answering"
          className="text-muted-foreground size-3.5 shrink-0 animate-spin"
        />
      )}
    </Button>
  );
  return (
    <Card className="h-[640px] max-h-[90svh] w-full max-w-sm gap-0 overflow-hidden p-0">
      <OpenChat
        chats={chats}
        header={(onNotice) => (
          <ChatActions chats={chats} chat={current} onNotice={onNotice} title={switcher}>
            <Button
              size="icon"
              variant="ghost"
              aria-label="New chat"
              title="New chat"
              onClick={() => {
                chats.newChat();
                setOpen(false);
              }}
            >
              <MessageSquarePlus />
            </Button>
          </ChatActions>
        )}
        over={
          open && (
            <section aria-label="Conversations" className="bg-background absolute inset-0 z-10">
              <ChatList chats={chats} onOpened={() => setOpen(false)} />
            </section>
          )
        }
      />
    </Card>
  );
}
