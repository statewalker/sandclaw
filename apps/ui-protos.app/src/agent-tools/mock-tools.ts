import type { AccessSettings, ToolSource } from "./access-model.js";

// The commands the agent could reach on Claire's laptop. Keys follow the
// shared-commands convention `<source>:<verb>`; labels and descriptions are the
// declarations' `.label()` / `.description()`.

const files: ToolSource = {
  id: "files",
  title: "Files",
  kind: "basic",
  loaded: true,
  commands: [
    { key: "files:read", label: "Read a file", description: "Opens a file in your folder." },
    { key: "files:list", label: "List a folder", description: "Sees which files a folder holds." },
    {
      key: "files:create",
      label: "Create a file",
      description: "Saves a new file; never replaces one.",
    },
    {
      key: "files:edit",
      label: "Change a file",
      description: "Rewrites part of a file that already exists.",
      risk: "overwrites",
    },
    {
      key: "files:move",
      label: "Move or rename a file",
      description: "Moves a file within your folder.",
    },
    {
      key: "files:delete",
      label: "Delete a file",
      description: "Moves a file to the bin.",
      risk: "deletes",
    },
  ],
};

const indexes: ToolSource = {
  id: "indexes",
  title: "Search indexes",
  kind: "basic",
  loaded: true,
  commands: [
    {
      key: "index:search",
      label: "Search your documents",
      description: "Finds passages that answer a question.",
    },
    {
      key: "index:similar",
      label: "Find similar passages",
      description: "Finds text close to a given passage.",
    },
    { key: "index:status", label: "Check the index", description: "Sees what is indexed yet." },
  ],
};

const notes: ToolSource = {
  id: "notes",
  title: "Notes and todos",
  kind: "basic",
  loaded: true,
  commands: [
    { key: "notes:read", label: "Read a note", description: "Opens one of your notes." },
    { key: "notes:create", label: "Write a note", description: "Adds a new note." },
    { key: "todos:list", label: "See your todos", description: "Reads your todo list." },
    { key: "todos:add", label: "Add a todo", description: "Adds an item to your todo list." },
    { key: "todos:done", label: "Tick off a todo", description: "Marks an item done." },
    {
      key: "notes:delete",
      label: "Delete a note",
      description: "Moves a note to the bin.",
      risk: "deletes",
    },
  ],
};

const mail: ToolSource = {
  id: "mail",
  title: "Mail",
  kind: "connector",
  loaded: true,
  commands: [
    { key: "mail:search", label: "Search your mail", description: "Finds messages by words." },
    { key: "mail:read", label: "Read a message", description: "Opens one message." },
    {
      key: "mail:draft",
      label: "Write a draft",
      description: "Saves a draft in your mailbox; you send it.",
    },
    {
      key: "mail:send",
      label: "Send a message",
      description: "Sends a message on your behalf.",
      risk: "sends",
    },
  ],
};

const sites: ToolSource = {
  id: "sites",
  title: "Sites",
  kind: "app",
  loaded: true,
  commands: [
    { key: "sites:list", label: "List your sites", description: "Sees the sites you made." },
    {
      key: "sites:generate",
      label: "Build a site from a folder",
      description: "Turns a folder into web pages, on this computer.",
    },
    {
      key: "sites:publish",
      label: "Publish a site",
      description: "Puts a site on the web for anyone with the link.",
      risk: "leaves",
    },
  ],
};

export const spreadsheet: ToolSource = {
  id: "spreadsheet",
  title: "Spreadsheet app",
  kind: "app",
  loaded: true,
  commands: [
    { key: "sheet:open", label: "Open a spreadsheet", description: "Opens it in the app." },
    { key: "sheet:read", label: "Read cells", description: "Reads a range of cells." },
    {
      key: "sheet:write",
      label: "Fill in cells",
      description: "Writes values over a range of cells.",
      risk: "overwrites",
    },
    { key: "sheet:chart", label: "Add a chart", description: "Draws a chart from a range." },
  ],
};

const slides: ToolSource = {
  id: "slides",
  title: "Slides",
  kind: "app",
  loaded: false,
  commands: [
    { key: "slides:open", label: "Open a deck", description: "Opens a deck in the app." },
    {
      key: "slides:add",
      label: "Add a slide",
      description: "Adds a slide to the open deck.",
    },
    {
      key: "slides:share",
      label: "Share a deck",
      description: "Sends a link to the deck by mail.",
      risk: "sends",
    },
  ],
};

export const toolSources: ToolSource[] = [files, indexes, notes, mail, sites, spreadsheet, slides];

/** Everything seen before the Spreadsheet app was first loaded. */
const known = toolSources
  .filter((s) => s !== spreadsheet)
  .flatMap((s) => s.commands.map((c) => c.key));

/** Claire's choices so far: Slides may not share, Sites may build without asking. */
export const claireSettings: AccessSettings = {
  groups: {},
  commands: { "slides:share": "block", "sites:generate": "allow" },
  known,
};

/** Nothing chosen yet, nothing new. */
export const untouchedSettings: AccessSettings = {
  groups: {},
  commands: {},
  known: toolSources.flatMap((s) => s.commands.map((c) => c.key)),
};

const at = (day: number, hhmm: string) => new Date(`2026-10-${day}T${hhmm}:00Z`);

/** When the agent last used each command (mock; from the tasks' tool calls). */
export const lastUsed: Record<string, Date> = {
  "files:read": at(10, "09:52"),
  "files:list": at(10, "08:40"),
  "files:create": at(10, "09:43"),
  "files:edit": at(8, "16:10"),
  "index:search": at(10, "09:15"),
  "notes:read": at(10, "09:30"),
  "todos:add": at(9, "17:02"),
  "mail:search": at(7, "11:05"),
  "mail:read": at(7, "11:06"),
  "sites:generate": at(3, "10:00"),
};
