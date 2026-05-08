import { Settings } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ProviderConfigPanel } from "./provider-config-panel.js";

/**
 * Header trigger + dialog wrapper around `<ProviderConfigPanel>`. Lets the
 * user re-edit credentials and the active model after the initial setup.
 */
export function ProviderSettingsDialog(): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" aria-label="AI settings">
          <Settings className="h-3.5 w-3.5" /> AI settings
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b p-4 pb-3">
          <DialogTitle>AI providers &amp; models</DialogTitle>
          <DialogDescription>
            Manage credentials for OpenAI, Anthropic, Google, and
            OpenAI-compatible providers, and pick the active model used for new
            chat sessions.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto">
          <ProviderConfigPanel />
        </div>
      </DialogContent>
    </Dialog>
  );
}
