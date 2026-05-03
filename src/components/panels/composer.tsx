import { Send, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

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
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // Auto-grow textarea up to a max height.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [draft]);

  const submit = (): void => {
    const text = draft.trim();
    if (!text || running || disabled) return;
    setDraft("");
    onSend(text);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    // Cmd/Ctrl+Enter sends; Enter alone inserts a newline.
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex items-end gap-2 border-t p-3">
      <Textarea
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        disabled={disabled}
        placeholder={placeholder ?? "Send a message… (Cmd/Ctrl+Enter)"}
        className="min-h-[40px] max-h-[240px] resize-none"
      />
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
    </div>
  );
}
