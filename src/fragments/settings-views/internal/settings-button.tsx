import { Intents } from "@statewalker/shared-intents";
import { Settings as SettingsIcon } from "lucide-react";
import type { ReactElement } from "react";
import { runOpenSettings } from "@/fragments/settings";
import { Button } from "@/fragments/shadcn-views";
import { useAdapter } from "@/fragments/workspace-bridge-views";

export interface SettingsButtonProps {
  /** Optional initial tab id to open (e.g. "providers"). */
  tabId?: string;
}

/**
 * Header trigger that fires `runOpenSettings`. Pure UI — the
 * dialog itself is rendered separately by `<SettingsDialog />`,
 * mounted once at the top of the React tree.
 */
export function SettingsButton({ tabId }: SettingsButtonProps): ReactElement {
  const intents = useAdapter(Intents);
  return (
    <Button
      size="sm"
      variant="ghost"
      aria-label="Settings"
      onClick={() => runOpenSettings(intents, { tabId })}
    >
      <SettingsIcon className="h-3.5 w-3.5" /> Settings
    </Button>
  );
}
