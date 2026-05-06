import { Send, Square } from "lucide-react";
import { useState } from "react";
import {
  PromptInput,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/prompt-kit/prompt-input";
import { Button } from "@/components/ui/button";

export interface ComposerProps {
  onSend: (text: string) => void;
  onStop: () => void;
  running: boolean;
  disabled: boolean;
  placeholder?: string;
}

export function Composer({
  onSend,
  onStop,
  running,
  disabled,
  placeholder,
}: ComposerProps): React.ReactElement {
  const [draft, setDraft] = useState("");

  const submit = (): void => {
    const text = draft.trim();
    if (!text || running || disabled) return;
    setDraft("");
    onSend(text);
  };

  return (
    <div className="border-t p-3">
      <PromptInput
        value={draft}
        onValueChange={setDraft}
        onSubmit={submit}
        disabled={disabled}
        isLoading={running}
        maxHeight={240}
      >
        <PromptInputTextarea
          placeholder={
            placeholder ?? "Send a message… (Shift+Enter for newline)"
          }
        />
        <PromptInputActions className="justify-end">
          {running ? (
            <Button
              onClick={onStop}
              variant="destructive"
              size="icon"
              aria-label="Stop"
            >
              <Square />
            </Button>
          ) : (
            <Button
              onClick={submit}
              disabled={disabled || !draft.trim()}
              size="icon"
              aria-label="Send"
            >
              <Send />
            </Button>
          )}
        </PromptInputActions>
      </PromptInput>
    </div>
  );
}
