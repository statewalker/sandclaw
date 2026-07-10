// PROTOTYPE — throwaway. Mock domain + state hook for the model-connections
// settings redesign. Delete this folder once a variant has been chosen and
// folded into the real models-config spec/catalog.
//
// Types mirror @statewalker/ai-providers (Connection / DiscoveredModel) but are
// duplicated locally so the prototype is self-contained and trivially deletable.
import { useCallback, useRef, useState } from "react";

export type ConnectionType =
  | "openai"
  | "anthropic"
  | "google"
  | "openai-compatible";

export type Capability = "chat" | "embedding" | "image-gen" | "tts";

// Prototype-only runtime status overlaid on top of the persisted shape.
export type ConnStatus = "idle" | "testing" | "connected" | "error";

export interface DiscoveredModel {
  id: string;
  label: string;
  capabilities?: Capability[];
}

export interface Connection {
  id: string;
  type: ConnectionType;
  name: string;
  url?: string;
  apiKey: string;
  discoveredModels?: DiscoveredModel[];
  discoveredAt?: number;
  starredModelIds: string[];
  status: ConnStatus;
  error?: string;
}

export interface ProviderMeta {
  type: ConnectionType;
  label: string;
  glyph: string; // emoji/symbol stand-in for a real provider icon
  accent: string; // tailwind text-color class for the glyph
  urlRequired: boolean;
  urlPlaceholder: string;
  keyPlaceholder: string;
}

export const PROVIDER_ORDER: ConnectionType[] = [
  "openai",
  "anthropic",
  "google",
  "openai-compatible",
];

export const PROVIDER_META: Record<ConnectionType, ProviderMeta> = {
  openai: {
    type: "openai",
    label: "OpenAI",
    glyph: "✸",
    accent: "text-emerald-500",
    urlRequired: false,
    urlPlaceholder: "https://api.openai.com/v1  (optional override)",
    keyPlaceholder: "sk-…",
  },
  anthropic: {
    type: "anthropic",
    label: "Anthropic",
    glyph: "◆",
    accent: "text-orange-500",
    urlRequired: true,
    urlPlaceholder: "https://your-cors-proxy/anthropic",
    keyPlaceholder: "sk-ant-…",
  },
  google: {
    type: "google",
    label: "Google",
    glyph: "❖",
    accent: "text-blue-500",
    urlRequired: false,
    urlPlaceholder: "https://generativelanguage.googleapis.com  (optional)",
    keyPlaceholder: "AIza…",
  },
  "openai-compatible": {
    type: "openai-compatible",
    label: "OpenAI-compatible",
    glyph: "⬡",
    accent: "text-violet-500",
    urlRequired: true,
    urlPlaceholder: "http://localhost:11434/v1",
    keyPlaceholder: "(optional)",
  },
};

// What a successful "discovery" returns per provider type.
const CATALOG: Record<ConnectionType, DiscoveredModel[]> = {
  openai: [
    { id: "gpt-4o", label: "GPT-4o", capabilities: ["chat"] },
    { id: "gpt-4o-mini", label: "GPT-4o mini", capabilities: ["chat"] },
    { id: "o3", label: "o3", capabilities: ["chat"] },
    {
      id: "text-embedding-3-large",
      label: "Embedding 3 Large",
      capabilities: ["embedding"],
    },
    { id: "dall-e-3", label: "DALL·E 3", capabilities: ["image-gen"] },
    { id: "tts-1", label: "TTS-1", capabilities: ["tts"] },
  ],
  anthropic: [
    { id: "claude-opus-4-8", label: "Claude Opus 4.8", capabilities: ["chat"] },
    {
      id: "claude-sonnet-4-6",
      label: "Claude Sonnet 4.6",
      capabilities: ["chat"],
    },
    {
      id: "claude-haiku-4-5",
      label: "Claude Haiku 4.5",
      capabilities: ["chat"],
    },
  ],
  google: [
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", capabilities: ["chat"] },
    {
      id: "gemini-2.5-flash",
      label: "Gemini 2.5 Flash",
      capabilities: ["chat"],
    },
    {
      id: "text-embedding-004",
      label: "Text Embedding 004",
      capabilities: ["embedding"],
    },
  ],
  "openai-compatible": [
    { id: "llama-3.3-70b", label: "Llama 3.3 70B", capabilities: ["chat"] },
    { id: "qwen2.5-coder", label: "Qwen2.5 Coder", capabilities: ["chat"] },
  ],
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Simulated listConnectionModels(): deterministic so every state is reachable.
// Type "fail" / "bad" into the API key to see the error branch.
async function fakeDiscover(c: Connection): Promise<DiscoveredModel[]> {
  await delay(900);
  if (PROVIDER_META[c.type].urlRequired && !c.url?.trim()) {
    throw new Error("Endpoint URL is required for this provider.");
  }
  if (!c.apiKey.trim() && c.type !== "openai-compatible") {
    throw new Error("API key is missing — paste a key and test again.");
  }
  if (/fail|bad/i.test(c.apiKey)) {
    throw new Error("401 Unauthorized — the provider rejected this API key.");
  }
  return CATALOG[c.type];
}

function makeInitialConnections(): Connection[] {
  return [
    {
      id: "openai",
      type: "openai",
      name: "OpenAI",
      apiKey: "sk-live-prototype",
      discoveredModels: CATALOG.openai,
      discoveredAt: Date.now() - 3_600_000,
      starredModelIds: ["gpt-4o", "gpt-4o-mini"],
      status: "connected",
    },
    {
      id: "anthropic",
      type: "anthropic",
      name: "Anthropic (proxy)",
      url: "https://cors.example.dev/anthropic",
      apiKey: "sk-ant-prototype",
      discoveredModels: CATALOG.anthropic,
      discoveredAt: Date.now() - 7_200_000,
      starredModelIds: ["claude-opus-4-8"],
      status: "connected",
    },
    // Dormant shell — never connected. Shows the "Not connected" path.
    {
      id: "google",
      type: "google",
      name: "Google",
      apiKey: "",
      starredModelIds: [],
      status: "idle",
    },
    // Self-hosted, no key. Test it to watch a fresh connect succeed.
    {
      id: "local",
      type: "openai-compatible",
      name: "Local Ollama",
      url: "http://localhost:11434/v1",
      apiKey: "",
      starredModelIds: [],
      status: "idle",
    },
  ];
}

export interface ConnectionsApi {
  connections: Connection[];
  test: (id: string) => Promise<void>;
  disconnect: (id: string) => void;
  update: (id: string, patch: Partial<Connection>) => void;
  toggleStar: (id: string, modelId: string) => void;
  addCustom: (type: ConnectionType) => string;
  remove: (id: string) => void;
}

let seq = 0;

export function useMockConnections(): ConnectionsApi {
  const [connections, setConnections] = useState<Connection[]>(
    makeInitialConnections,
  );
  const ref = useRef(connections);
  ref.current = connections;

  const update = useCallback((id: string, patch: Partial<Connection>) => {
    setConnections((cs) =>
      cs.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );
  }, []);

  const test = useCallback(
    async (id: string) => {
      update(id, { status: "testing", error: undefined });
      const current = ref.current.find((c) => c.id === id);
      if (!current) return;
      try {
        const models = await fakeDiscover(current);
        setConnections((cs) =>
          cs.map((c) => {
            if (c.id !== id) return c;
            // Seed one starred chat model on first successful connect.
            const seeded =
              c.starredModelIds.length === 0
                ? models
                    .filter((m) => m.capabilities?.includes("chat"))
                    .slice(0, 1)
                    .map((m) => m.id)
                : c.starredModelIds;
            return {
              ...c,
              status: "connected",
              error: undefined,
              discoveredModels: models,
              discoveredAt: Date.now(),
              starredModelIds: seeded,
            };
          }),
        );
      } catch (e) {
        update(id, { status: "error", error: (e as Error).message });
      }
    },
    [update],
  );

  const disconnect = useCallback(
    (id: string) =>
      update(id, {
        status: "idle",
        apiKey: "",
        discoveredModels: undefined,
        discoveredAt: undefined,
        starredModelIds: [],
      }),
    [update],
  );

  const toggleStar = useCallback((id: string, modelId: string) => {
    setConnections((cs) =>
      cs.map((c) =>
        c.id === id
          ? {
              ...c,
              starredModelIds: c.starredModelIds.includes(modelId)
                ? c.starredModelIds.filter((m) => m !== modelId)
                : [...c.starredModelIds, modelId],
            }
          : c,
      ),
    );
  }, []);

  const addCustom = useCallback((type: ConnectionType) => {
    const id = `custom-${type}-${++seq}`;
    setConnections((cs) => [
      ...cs,
      {
        id,
        type,
        name: `${PROVIDER_META[type].label} connection`,
        url: PROVIDER_META[type].urlRequired ? "" : undefined,
        apiKey: "",
        starredModelIds: [],
        status: "idle",
      },
    ]);
    return id;
  }, []);

  const remove = useCallback((id: string) => {
    setConnections((cs) => cs.filter((c) => c.id !== id));
  }, []);

  return {
    connections,
    test,
    disconnect,
    update,
    toggleStar,
    addCustom,
    remove,
  };
}
