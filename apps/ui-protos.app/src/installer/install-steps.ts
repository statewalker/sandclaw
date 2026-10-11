// The machine installer (A1): a wizard served on localhost on the group's Mac
// mini. The setup service behind it is not designed yet, so everything here is
// mock: the machine facts, the catalogue, the services and their failures.

export type StepId = "check" | "models" | "names" | "download" | "start" | "invite";

export interface Step {
  id: StepId;
  /** Short, for the step rail. */
  label: string;
  /** The step's heading. */
  title: string;
}

// The questions come first, the waiting after: once the names are given, the
// person can walk away until the invite is ready.
export const steps: Step[] = [
  { id: "check", label: "This Mac", title: "Check this Mac" },
  { id: "models", label: "Models", title: "Choose the AI models" },
  { id: "names", label: "Names", title: "Name the group" },
  { id: "download", label: "Download", title: "Download" },
  { id: "start", label: "Start", title: "Start and test the services" },
  { id: "invite", label: "Invite", title: "Invite yourself" },
];

export const stepIndex = (id: StepId) => steps.findIndex((s) => s.id === id);

/** Where the wizard reopens after a restart: the first step not done yet. */
export function resumeStep(done: StepId[]): StepId {
  return steps.find((s) => !done.includes(s.id))?.id ?? "invite";
}

// --- Prerequisites ---------------------------------------------------------

/** What the setup service reads from the machine (mock). */
export interface MachineFacts {
  dockerInstalled: boolean;
  dockerRunning: boolean;
  freeDiskGB: number;
  memoryGB: number;
  /** "Apple M2", "Intel Core i5". */
  chip: string;
  /** Apple silicon: local models run on its GPU. */
  appleSilicon: boolean;
}

export const macMini: MachineFacts = {
  dockerInstalled: true,
  dockerRunning: true,
  freeDiskGB: 182,
  memoryGB: 16,
  chip: "Apple M2",
  appleSilicon: true,
};

export type CheckStatus = "pass" | "warn" | "fail";

export interface CheckResult {
  id: "docker" | "disk" | "memory" | "gpu";
  label: string;
  status: CheckStatus;
  /** What it means, in plain words. */
  says: string;
  /** What to do about it, when something is wrong. */
  fix?: string;
  /** For whoever helps: what the setup service actually saw. */
  technical: string;
}

/** Room kept on top of the downloads, for the indexes and the group's data. */
export const DISK_ROOM_GB = 20;
const MIN_MEMORY_GB = 8;
const COMFORT_MEMORY_GB = 16;

export const requiredDiskGB = (downloadGB: number) => Math.ceil(downloadGB + DISK_ROOM_GB);

export function evaluateChecks(facts: MachineFacts, needDiskGB: number): CheckResult[] {
  const docker: CheckResult = !facts.dockerInstalled
    ? {
        id: "docker",
        label: "Docker",
        status: "fail",
        says: "Docker isn't installed. Sandclaw runs inside it.",
        fix: "Install Docker Desktop from docker.com, open it once, then check again.",
        technical: "docker: command not found",
      }
    : !facts.dockerRunning
      ? {
          id: "docker",
          label: "Docker",
          status: "fail",
          says: "Docker is installed but not running.",
          fix: "Open Docker Desktop and wait until it says it is running, then check again.",
          technical: "Cannot connect to the Docker daemon at unix:///var/run/docker.sock",
        }
      : {
          id: "docker",
          label: "Docker",
          status: "pass",
          says: "Installed and running.",
          technical: "Docker Desktop 4.48 · Model Runner enabled",
        };

  const free = facts.freeDiskGB;
  const disk: CheckResult =
    free < needDiskGB
      ? {
          id: "disk",
          label: "Disk space",
          status: "fail",
          says: `${free} GB free; Sandclaw needs at least ${needDiskGB} GB.`,
          fix: "Free some space on this Mac (or attach a disk), then check again.",
          technical: `df /: ${free} GB available, ${needDiskGB} GB required`,
        }
      : {
          id: "disk",
          label: "Disk space",
          status: free < needDiskGB * 2 ? "warn" : "pass",
          says:
            free < needDiskGB * 2
              ? `${free} GB free: enough to start, but the group's indexes will grow.`
              : `${free} GB free, plenty.`,
          technical: `df /: ${free} GB available, ${needDiskGB} GB required`,
        };

  const memory: CheckResult = {
    id: "memory",
    label: "Memory",
    status:
      facts.memoryGB < MIN_MEMORY_GB
        ? "fail"
        : facts.memoryGB < COMFORT_MEMORY_GB
          ? "warn"
          : "pass",
    says:
      facts.memoryGB < MIN_MEMORY_GB
        ? `${facts.memoryGB} GB; Sandclaw needs at least ${MIN_MEMORY_GB} GB to run the models.`
        : facts.memoryGB < COMFORT_MEMORY_GB
          ? `${facts.memoryGB} GB: only the smaller models will fit.`
          : `${facts.memoryGB} GB, enough for the recommended models.`,
    fix: facts.memoryGB < MIN_MEMORY_GB ? "Use a Mac with more memory." : undefined,
    technical: `hw.memsize: ${facts.memoryGB} GB`,
  };

  const gpu: CheckResult = facts.appleSilicon
    ? {
        id: "gpu",
        label: "Graphics (GPU)",
        status: "pass",
        says: `${facts.chip}: the models run on its GPU.`,
        technical: `${facts.chip} · Metal available to Docker Model Runner`,
      }
    : {
        id: "gpu",
        label: "Graphics (GPU)",
        status: "warn",
        says: `${facts.chip}: no usable GPU, so answers will be slow.`,
        technical: `${facts.chip} · no Metal GPU, models run on the CPU`,
      };

  return [docker, disk, memory, gpu];
}

/** A warning lets the person go on; a failure does not. */
export const checksPass = (results: CheckResult[]) => results.every((r) => r.status !== "fail");

// --- Models and downloads --------------------------------------------------

export type Job = "chat" | "summary" | "embedding";

export const jobs: { job: Job; label: string; what: string }[] = [
  { job: "chat", label: "Chat", what: "Answers the group's questions." },
  { job: "summary", label: "Summaries", what: "Summarises documents and long chats." },
  { job: "embedding", label: "Search", what: "Lets the assistant find things in the folders." },
];

export interface ModelOption {
  id: string;
  name: string;
  sizeGB: number;
  /** Below this much memory the model does not fit. */
  minMemoryGB: number;
  jobs: Job[];
  /** One line on why someone would pick it. */
  note: string;
}

export const catalogue: ModelOption[] = [
  {
    id: "llama-3.2-3b",
    name: "Llama 3.2 3B",
    sizeGB: 2,
    minMemoryGB: 8,
    jobs: ["chat", "summary"],
    note: "Quick, short answers.",
  },
  {
    id: "llama-3.1-8b",
    name: "Llama 3.1 8B",
    sizeGB: 4.9,
    minMemoryGB: 16,
    jobs: ["chat", "summary"],
    note: "Good everyday answers. Recommended.",
  },
  {
    id: "qwen-2.5-14b",
    name: "Qwen 2.5 14B",
    sizeGB: 9,
    minMemoryGB: 24,
    jobs: ["chat"],
    note: "Better answers, slower.",
  },
  {
    id: "nomic-embed",
    name: "Nomic Embed",
    sizeGB: 0.3,
    minMemoryGB: 8,
    jobs: ["embedding"],
    note: "Recommended.",
  },
  {
    id: "mxbai-embed",
    name: "mxbai Embed Large",
    sizeGB: 0.7,
    minMemoryGB: 16,
    jobs: ["embedding"],
    note: "Finds a little more, twice the size.",
  },
];

export type ModelChoice = Record<Job, string>;

export const defaultChoice: ModelChoice = {
  chat: "llama-3.1-8b",
  summary: "llama-3.2-3b",
  embedding: "nomic-embed",
};

/** Sandclaw's own images: hub, LiteLLM, indexer. The model runtime ships with Docker. */
export const SANDCLAW_IMAGES = {
  id: "sandclaw",
  label: "Sandclaw (hub, LLM API, indexer)",
  sizeGB: 1.7,
  technical: "sandclaw/hub:1.0 · ghcr.io/berriai/litellm:main-stable · sandclaw/indexer:1.0",
};

export interface DownloadItem {
  id: string;
  label: string;
  sizeGB: number;
}

/** What gets downloaded for a choice: a model picked for two jobs comes once. */
export function downloadPlan(choice: ModelChoice): { items: DownloadItem[]; totalGB: number } {
  const ids = [...new Set(Object.values(choice))];
  const models = ids.flatMap((id) => catalogue.filter((m) => m.id === id));
  const items: DownloadItem[] = [
    { id: SANDCLAW_IMAGES.id, label: SANDCLAW_IMAGES.label, sizeGB: SANDCLAW_IMAGES.sizeGB },
    ...models.map((m) => ({ id: m.id, label: m.name, sizeGB: m.sizeGB })),
  ];
  const totalGB = Math.round(items.reduce((sum, i) => sum + i.sizeGB, 0) * 10) / 10;
  return { items, totalGB };
}

/** Seconds to download `sizeGB` at `mbps` megabits per second. */
export const downloadSeconds = (sizeGB: number, mbps: number) => (sizeGB * 8000) / mbps;

/** "under a minute", "about 7 min", "about 1 h 20 min". */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return "under a minute";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `about ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `about ${h} h` : `about ${h} h ${m} min`;
}

/** "4.9 GB", "0.3 GB". */
export const formatGB = (gb: number) => `${Math.round(gb * 10) / 10} GB`;

// --- Names -----------------------------------------------------------------

export interface Names {
  group: string;
  admin: string;
}

export type NameErrors = Partial<Record<keyof Names, string>>;

export const MAX_NAME = 40;

/** Mistakes by field; empty when the names can be used. */
export function validateNames(names: Names): NameErrors {
  const errors: NameErrors = {};
  const group = names.group.trim();
  const admin = names.admin.trim();
  if (!group) errors.group = "Give the group a name; everyone in it will see it.";
  else if (group.length > MAX_NAME) errors.group = `Keep it under ${MAX_NAME} characters.`;
  if (!admin) errors.admin = "Your name, as the others will see it.";
  else if (admin.length > MAX_NAME) errors.admin = `Keep it under ${MAX_NAME} characters.`;
  return errors;
}

// --- Services --------------------------------------------------------------

export type ServiceId = "runtime" | "llm-api" | "indexer" | "hub";

export interface ServiceInfo {
  id: ServiceId;
  name: string;
  /** What it does, in plain words. */
  does: string;
  /** How it is tested, in plain words. */
  test: string;
  technical: string;
  /** What a failed test says (mock): plain words, then the log for whoever helps. */
  failure: { says: string; log: string };
}

// In start order: each one needs the one before.
export const services: ServiceInfo[] = [
  {
    id: "runtime",
    name: "Model runtime",
    does: "Runs the AI models on this Mac.",
    test: "Loads the chat model.",
    technical: "Docker Model Runner · localhost:12434",
    failure: {
      says: "The chat model didn't load: this Mac ran out of memory while loading it. Closing other apps usually helps.",
      log: "model-runner: llama.cpp: failed to allocate 5.1 GiB (Metal): out of memory\nGET /engines/llama.cpp/v1/models → 503",
    },
  },
  {
    id: "llm-api",
    name: "LLM API",
    does: "One door to every model, for the hub.",
    test: "Asks the chat model to say hello.",
    technical: "LiteLLM · container sandclaw-litellm · localhost:4000",
    failure: {
      says: "The LLM API didn't answer within a minute. It may still be starting.",
      log: "POST http://localhost:4000/v1/chat/completions → 504 Gateway Timeout\nlitellm: upstream model-runner timed out after 60s",
    },
  },
  {
    id: "indexer",
    name: "Indexer",
    does: "Reads the group's folders so search can find things.",
    test: "Indexes a sample page and finds it again.",
    technical: "container sandclaw-indexer · localhost:7700",
    failure: {
      says: "The indexer couldn't reach the search model.",
      log: "indexer: POST http://litellm:4000/v1/embeddings → connection refused",
    },
  },
  {
    id: "hub",
    name: "Hub",
    does: "The group's address: invitations, devices, the assistant.",
    test: "Opens the group's address from outside this Mac.",
    technical: "container sandclaw-hub · localhost:8443",
    failure: {
      says: "The hub started, but other devices can't reach it. The router may be blocking it.",
      log: "hub: relay handshake failed: wss://relay.sandclaw.ai → 403 (port mapping refused)",
    },
  },
];

// --- The first invite ------------------------------------------------------

/** The admin's own invite: one use, made by the hub once it passes its test (mock). */
export function firstInviteLink(groupName: string): string {
  const slug = groupName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `https://app.sandclaw.ai/join#k=a41d07b9-${slug || "group"}-admin`;
}
