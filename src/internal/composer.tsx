import { type ComposerAction, composerActionsSlot } from "@repo/chat-mini.chat";
import {
  compareByOrderAndId,
  type KeyedSlotView,
  useAdapter,
  useSlot,
  useViewRegistry,
  type ViewComponent,
} from "@statewalker/core-react";
import { Button } from "@statewalker/shadcn-react";
import { Slots } from "@statewalker/shared-slots";
import { Send, Square } from "lucide-react";
import {
  type ComponentType,
  type ReactElement,
  useMemo,
  useState,
} from "react";
import {
  PromptInput,
  PromptInputActions,
  PromptInputTextarea,
} from "./prompt-kit/prompt-input.js";

export interface ComposerProps {
  onSend: (text: string) => void;
  onStop: () => void;
  running: boolean;
  disabled: boolean;
  placeholder?: string;
}

/**
 * `Composer` reads `chat:composer-actions` and renders contributions
 * leading or trailing the hard-coded Send/Stop buttons. Send/Stop
 * stay built-in because they own draft state + focus; everything
 * else (model picker, attach buttons, plug-in actions) flows
 * through the slot.
 */
export function Composer({
  onSend,
  onStop,
  running,
  disabled,
  placeholder,
}: ComposerProps): ReactElement {
  const [draft, setDraft] = useState("");
  const slots = useAdapter(Slots);
  // Subscribed adapter — re-renders when a contributed action's
  // viewKey is registered late.
  const registry = useViewRegistry();
  const actions = useSlot(slots, composerActionsSlot);

  const { leading, trailing } = useMemo(() => splitActions(actions), [actions]);

  const submit = (): void => {
    const text = draft.trim();
    if (!text || running || disabled) return;
    setDraft("");
    onSend(text);
  };

  return (
    // Centered max-width container, no top border — matches webclaw layout.
    <div className="relative mx-auto w-full max-w-[768px] px-5 pb-3">
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
        <PromptInputActions className="justify-between">
          <div className="flex items-center gap-1">
            {leading.map((action) => (
              <ActionSlot key={action.id} action={action} registry={registry} />
            ))}
          </div>
          <div className="flex items-center gap-1">
            {trailing.map((action) => (
              <ActionSlot key={action.id} action={action} registry={registry} />
            ))}
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
        </PromptInputActions>
      </PromptInput>
    </div>
  );
}

function splitActions(actions: readonly ComposerAction[]): {
  leading: ComposerAction[];
  trailing: ComposerAction[];
} {
  const leading: ComposerAction[] = [];
  const trailing: ComposerAction[] = [];
  for (const a of actions) {
    if (a.position === "trailing") trailing.push(a);
    else leading.push(a);
  }
  leading.sort(compareByOrderAndId);
  trailing.sort(compareByOrderAndId);
  return { leading, trailing };
}

function ActionSlot({
  action,
  registry,
}: {
  action: ComposerAction;
  registry: KeyedSlotView<ViewComponent>;
}): ReactElement | null {
  const Component = registry.get(action.viewKey);
  if (!Component) return null;
  const Cast = Component as ComponentType<unknown>;
  return <Cast />;
}
