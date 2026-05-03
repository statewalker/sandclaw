import { useCallback } from "react";
import { ActiveModelPicker } from "@/components/providers/active-model-picker";
import { CanonicalForm } from "@/components/providers/canonical-form";
import { CustomProvidersList } from "@/components/providers/custom-providers-list";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRuntime } from "@/contexts/runtime-context";
import {
  type CanonicalCredentials,
  type CanonicalProviderName,
  type CustomProvider,
  emptyProvidersConfig,
  type ProvidersConfig,
} from "@/services/providers-store";

const CANONICAL_TABS = [
  { name: "openai", label: "OpenAI" },
  { name: "anthropic", label: "Anthropic" },
  { name: "google", label: "Google" },
] as const satisfies ReadonlyArray<{
  name: CanonicalProviderName;
  label: string;
}>;

export function ProviderConfigPanel(): React.ReactElement {
  const { state, saveProviders } = useRuntime();
  const config: ProvidersConfig =
    state.status === "ready" ||
    state.status === "no-providers" ||
    state.status === "no-active-model"
      ? state.config
      : emptyProvidersConfig;

  const setCanonical = useCallback(
    async (
      name: CanonicalProviderName,
      credentials: CanonicalCredentials | null,
    ): Promise<void> => {
      const next: ProvidersConfig = {
        schemaVersion: 2,
        remote: { ...config.remote },
        custom: [...config.custom],
        active: { ...config.active },
      };
      if (credentials === null) {
        delete next.remote[name];
        // If the active provider was this one, clear it.
        if (next.active.providerId === name) next.active = {};
      } else {
        next.remote[name] = credentials;
      }
      await saveProviders(next);
    },
    [config, saveProviders],
  );

  const upsertCustom = useCallback(
    async (entry: CustomProvider): Promise<void> => {
      const idx = config.custom.findIndex((c) => c.id === entry.id);
      const nextCustom =
        idx >= 0
          ? config.custom.map((c, i) => (i === idx ? entry : c))
          : [...config.custom, entry];
      const next: ProvidersConfig = {
        schemaVersion: 2,
        remote: { ...config.remote },
        custom: nextCustom,
        active: { ...config.active },
      };
      await saveProviders(next);
    },
    [config, saveProviders],
  );

  const removeCustom = useCallback(
    async (id: string): Promise<void> => {
      const next: ProvidersConfig = {
        schemaVersion: 2,
        remote: { ...config.remote },
        custom: config.custom.filter((c) => c.id !== id),
        active: { ...config.active },
      };
      if (next.active.providerId === id) next.active = {};
      await saveProviders(next);
    },
    [config, saveProviders],
  );

  const setActive = useCallback(
    async (
      providerId: string | undefined,
      modelId: string | undefined,
    ): Promise<void> => {
      const next: ProvidersConfig = {
        schemaVersion: 2,
        remote: { ...config.remote },
        custom: [...config.custom],
        active: { providerId, modelId },
      };
      await saveProviders(next);
    },
    [config, saveProviders],
  );

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Active model</CardTitle>
          <CardDescription>
            Pick the provider and model used for new chat sessions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActiveModelPicker
            config={config}
            providerId={config.active.providerId}
            modelId={config.active.modelId}
            onChange={setActive}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Providers</CardTitle>
          <CardDescription>
            Credentials are stored as a JSON file inside the workspace. Switch
            workspaces to use different keys.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={CANONICAL_TABS[0].name}>
            <TabsList className="w-full">
              {CANONICAL_TABS.map((p) => (
                <TabsTrigger key={p.name} value={p.name}>
                  {p.label}
                </TabsTrigger>
              ))}
              <TabsTrigger value="openai-compatible">
                OpenAI-compatible
              </TabsTrigger>
            </TabsList>
            {CANONICAL_TABS.map((p) => (
              <TabsContent key={p.name} value={p.name}>
                <CanonicalForm
                  name={p.name}
                  initial={config.remote[p.name]}
                  onSave={(credentials) => setCanonical(p.name, credentials)}
                  onClear={() => setCanonical(p.name, null)}
                />
              </TabsContent>
            ))}
            <TabsContent value="openai-compatible">
              <CustomProvidersList
                providers={config.custom}
                onSave={upsertCustom}
                onAdd={upsertCustom}
                onDelete={removeCustom}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
